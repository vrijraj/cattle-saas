import { getFarm } from "@/lib/farm-context";
import { geminiConfigured } from "@/lib/ai/config";
import type { AiEvent, AiImageAttachment, AiTurn } from "@/lib/ai/run";
import { countMonthlyAiSessions, loadLatestUserChat, saveUserChatMessages } from "@/lib/ai/sessions";
import { checkDistributedRateLimit } from "@/lib/rate-limit-db";

export const runtime = "nodejs";

const messageSchema = /^[\s\S]{1,4000}$/;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BASE64_LEN = 5_600_000; // ~4 MB raw image

export async function GET() {
  const farm = await getFarm();
  if (!farm) return Response.json({ error: "Sign in to load chat history." }, { status: 401 });
  const chat = await loadLatestUserChat(farm.farmId, farm.userId);
  return Response.json(chat);
}

export async function PUT(request: Request) {
  const farm = await getFarm();
  if (!farm) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { sessionId?: unknown; messages?: unknown } | null;
  if (typeof body?.sessionId !== "string" || !Array.isArray(body.messages)) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
  await saveUserChatMessages(farm.farmId, farm.userId, body.sessionId, body.messages);
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const farm = await getFarm();
  if (!farm) return Response.json({ error: "Sign in to use the assistant." }, { status: 401 });

  const rl = await checkDistributedRateLimit(`ai:${farm.farmId}:${farm.userId}`, { limit: 20, windowMs: 60 * 1000 });
  if (!rl.allowed) {
    return Response.json({ error: "Too many AI requests. Wait a minute and try again." }, { status: 429 });
  }

  if (farm.aiMonthlyLimit > 0) {
    const used = await countMonthlyAiSessions(farm.farmId);
    if (used > farm.aiMonthlyLimit) {
      return Response.json(
        { error: `Monthly AI limit reached (${farm.aiMonthlyLimit} sessions). Upgrade your plan in Farm settings.` },
        { status: 429 },
      );
    }
  }

  if (!geminiConfigured()) {
    return Response.json(
      { error: "Add GEMINI_API_KEY to .env and restart the server. The key comes from Google AI Studio." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    sessionId?: unknown;
    image?: { mimeType?: unknown; base64?: unknown };
    confirmation?: { id?: unknown; confirmed?: unknown };
  } | null;

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined;

  let image: AiImageAttachment | undefined;
  if (body?.image && typeof body.image === "object") {
    const mime = typeof body.image.mimeType === "string" ? body.image.mimeType : "";
    const base64 = typeof body.image.base64 === "string" ? body.image.base64 : "";
    if (!ALLOWED_IMAGE_TYPES.has(mime) || !base64 || base64.length > MAX_IMAGE_BASE64_LEN) {
      return Response.json({ error: "Attach a JPEG, PNG, or WebP image under 4 MB." }, { status: 400 });
    }
    image = { mimeType: mime as AiImageAttachment["mimeType"], base64 };
  }

  const confirmation =
    body?.confirmation && typeof body.confirmation.id === "string" && typeof body.confirmation.confirmed === "boolean"
      ? { kind: "confirm" as const, id: body.confirmation.id, confirmed: body.confirmation.confirmed }
      : null;

  if (!confirmation && !image && !messageSchema.test(message)) {
    return Response.json({ error: "Write a question of up to 4000 characters or attach a photo." }, { status: 400 });
  }

  const turn: AiTurn = confirmation ?? { kind: "text", text: message, image };

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AiEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
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
            canRecordVaccines: farm.canRecordVaccines,
            matingGenerationWindow: farm.matingGenerationWindow,
            userName: farm.userName ?? farm.email,
          },
          turn,
          sessionId,
          request.signal,
        )) {
          if (closed) break;
          send(event);
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "The assistant stopped.";
        send({ type: "error", message: detail });
        send({ type: "done" });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // stream already closed
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
