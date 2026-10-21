import { getFarm } from "@/lib/farm-context";
import { geminiConfigured } from "@/lib/ai/config";
import type { AiEvent, AiTurn } from "@/lib/ai/run";

export const runtime = "nodejs";

const messageSchema = /^[\s\S]{1,4000}$/;

export async function POST(request: Request) {
  const farm = await getFarm();
  if (!farm) return Response.json({ error: "Sign in to use the assistant." }, { status: 401 });
  if (!geminiConfigured()) {
    return Response.json(
      { error: "Add GEMINI_API_KEY to .env and restart the server. The key comes from Google AI Studio." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    sessionId?: unknown;
    confirmation?: { id?: unknown; confirmed?: unknown };
  } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined;
  const confirmation =
    body?.confirmation && typeof body.confirmation.id === "string" && typeof body.confirmation.confirmed === "boolean"
      ? { kind: "confirm" as const, id: body.confirmation.id, confirmed: body.confirmation.confirmed }
      : null;
  if (!confirmation && !messageSchema.test(message)) {
    return Response.json({ error: "Write a question of up to 4000 characters." }, { status: 400 });
  }
  const turn: AiTurn = confirmation ?? { kind: "text", text: message };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AiEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        const { runFarmAssistant } = await import("@/lib/ai/run");
        for await (const event of runFarmAssistant(
          {
            userId: farm.userId,
            farmId: farm.farmId,
            farmName: farm.farmName,
            farmSlug: farm.farmSlug,
            timezone: farm.timezone,
            roles: farm.roles,
            userName: farm.userName ?? farm.email,
          },
          turn,
          sessionId,
          request.signal,
        )) {
          send(event);
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "The assistant stopped.";
        send({ type: "error", message: detail });
        send({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
