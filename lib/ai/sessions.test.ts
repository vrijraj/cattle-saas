import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppendEventRequest } from "@google/adk";
import { afterEach, describe, expect, it } from "vitest";
import { DurableSessionService } from "./sessions";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function event(id: string, text: string): AppendEventRequest["event"] {
  return {
    id,
    invocationId: "turn-1",
    author: "user",
    timestamp: Date.now(),
    content: { role: "user", parts: [{ text }] },
    actions: { stateDelta: {} },
  } as AppendEventRequest["event"];
}

describe("durable assistant sessions", () => {
  it("keeps the conversation after a new service starts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cattle-ai-"));
    dirs.push(dir);
    const file = join(dir, "ai-sessions.json");
    const first = new DurableSessionService(file);
    await first.whenReady();
    const created = await first.createSession({ appName: "cattle-farm-assistant", userId: "asha" });
    const loaded = await first.getSession({ appName: "cattle-farm-assistant", userId: "asha", sessionId: created.id });
    expect(loaded).toBeTruthy();
    await first.appendEvent({ session: loaded!, event: event("e1", "Who is due to calve?") });

    const second = new DurableSessionService(file);
    await second.whenReady();
    const restored = await second.getSession({ appName: "cattle-farm-assistant", userId: "asha", sessionId: created.id });
    expect(restored?.events.map((item) => item.content?.parts?.[0]?.text)).toEqual(["Who is due to calve?"]);
  });
});
