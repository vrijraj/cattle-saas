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

export type AiTurn =
  | { kind: "text"; text: string }
  | { kind: "confirm"; id: string; confirmed: boolean };

export type AiEvent =
  | { type: "session"; id: string; fresh: boolean }
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "tool"; name: string }
  | { type: "confirm"; id: string; tool: string; args: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done" };

function textOf(event: { content?: { parts?: Array<{ text?: string; thought?: boolean }> } }) {
  return (event.content?.parts ?? [])
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join("");
}

export async function* runFarmAssistant(scope: FarmScope, turn: AiTurn, sessionId: string | undefined, abortSignal?: AbortSignal): AsyncGenerator<AiEvent> {
  const today = formatDisplayDate(farmToday(scope.timezone));
  const agent = new LlmAgent({
    name: "farm_assistant",
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
    description: `Looks up and records ${scope.farmName} data with Gemini function calls.`,
    instruction: `You are the farm assistant for ${scope.farmName}. The signed-in person is ${scope.userName}. Today is ${today}. Money is INR. Speak dates like ${today}. Pass tool dates as YYYY-MM-DD.

Use function calls for every lookup and every save. Never answer a number, name, date, or status from memory. If a function says this role cannot open a register, say that and do not guess.

Saving functions wait for the person to confirm. Call the function with the fields they asked for, then wait. Do not claim a record was saved until the function result says saved is true. You cannot void or delete records.

Mating checks are decision support. Repeat the disclaimer the function returns. For male cattle, reproduction and lactation are not applicable.

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
  let waiting = false;
  const newMessage =
    turn.kind === "text"
      ? { role: "user" as const, parts: [{ text: turn.text }] }
      : {
          role: "user" as const,
          parts: [
            {
              functionResponse: {
                id: turn.id,
                name: "adk_request_confirmation",
                response: { confirmed: turn.confirmed },
              },
            },
          ],
        };
  try {
    for await (const event of runner.runAsync({
      userId: scope.userId,
      sessionId: session.id,
      abortSignal,
      newMessage,
      runConfig: { streamingMode: StreamingMode.SSE, plainTextToolConfirmation: true },
    })) {
      if (event.errorCode || event.errorMessage) {
        failed = true;
        yield { type: "error", message: event.errorMessage || "Gemini could not answer that." };
        continue;
      }
      for (const call of getFunctionCalls(event)) {
        if (call.name === "adk_request_confirmation") {
          const original = call.args?.originalFunctionCall as { name?: string; args?: Record<string, unknown> } | undefined;
          if (call.id && original?.name) {
            waiting = true;
            answered = true;
            yield { type: "confirm", id: call.id, tool: original.name, args: original.args ?? {} };
          }
          continue;
        }
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
  if (!answered && !failed && !waiting) {
    yield { type: "replace", text: "I could not put an answer together from the farm records. Ask again with an animal code or a screen name." };
  }
  yield { type: "done" };
}
