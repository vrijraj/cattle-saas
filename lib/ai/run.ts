import "server-only";

import { getFunctionCalls, InMemorySessionService, isFinalResponse, LlmAgent, Runner, StreamingMode } from "@google/adk";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { farmTools, type FarmScope } from "@/lib/ai/tools";

const APP_NAME = "cattle-farm-assistant";

const globalAi = globalThis as unknown as { cattleAiSessions?: InMemorySessionService };

function sessions() {
  globalAi.cattleAiSessions ??= new InMemorySessionService();
  return globalAi.cattleAiSessions;
}

export type AiEvent =
  | { type: "session"; id: string; fresh: boolean }
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "tool"; name: string }
  | { type: "error"; message: string }
  | { type: "done" };

function textOf(event: { content?: { parts?: Array<{ text?: string; thought?: boolean }> } }) {
  return (event.content?.parts ?? [])
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join("");
}

export async function* runFarmAssistant(scope: FarmScope, message: string, sessionId: string | undefined, abortSignal?: AbortSignal): AsyncGenerator<AiEvent> {
  const today = formatDisplayDate(farmToday(scope.timezone));
  const agent = new LlmAgent({
    name: "farm_assistant",
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
    description: `Answers questions about ${scope.farmName} from the live farm records.`,
    instruction: `You are the farm assistant for ${scope.farmName}. The signed-in person is ${scope.userName}. Today is ${today}. Money is INR. Write dates as ${today}.

Help with the whole farm workspace: dashboard, cattle, family tree, breeding, health, milk, feed, semen, genetics, embryos, finance, alerts, reports, shop, team, and audit.

Use tools for every number, name, date, and status. If a tool says this role cannot open a register, say that and do not guess. Never invent cattle, yields, or money.

You cannot create, edit, void, or delete records. When someone wants to save something, name the screen, include its path, and say what to enter.

Mating checks are decision support. Repeat the disclaimer the tool returns. For male cattle, reproduction and lactation are not applicable.

Answer in short paragraphs. Use the animal name and code together. When you mention a screen, include its path.`,
    tools: farmTools(scope),
  });

  const store = sessions();
  const existing = sessionId ? await store.getSession({ appName: APP_NAME, userId: scope.userId, sessionId }) : undefined;
  const session = existing ?? (await store.createSession({ appName: APP_NAME, userId: scope.userId }));
  yield { type: "session", id: session.id, fresh: !existing };

  const runner = new Runner({ appName: APP_NAME, agent, sessionService: store });
  let answered = false;
  let failed = false;
  try {
    for await (const event of runner.runAsync({
      userId: scope.userId,
      sessionId: session.id,
      abortSignal,
      newMessage: { role: "user", parts: [{ text: message }] },
      runConfig: { streamingMode: StreamingMode.SSE },
    })) {
      if (event.errorCode || event.errorMessage) {
        failed = true;
        yield { type: "error", message: event.errorMessage || "Gemini could not answer that." };
        continue;
      }
      for (const call of getFunctionCalls(event)) {
        if (call.name) yield { type: "tool", name: call.name };
      }
      const text = textOf(event);
      if (!text) continue;
      if (event.partial) {
        answered = true;
        yield { type: "delta", text };
      } else if (isFinalResponse(event)) {
        answered = true;
        yield { type: "replace", text };
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The assistant stopped.";
    yield { type: "error", message: detail };
  }
  if (!answered && !failed) {
    yield { type: "replace", text: "I could not put an answer together from the farm records. Ask again with an animal code or a screen name." };
  }
  yield { type: "done" };
}
