import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { InMemorySessionService } from "@google/adk";
import type { AppendEventRequest, CreateSessionRequest, GetSessionRequest } from "@google/adk";
import { db } from "@/db";
import { aiSessions } from "@/db/schema";

type StoredEvent = AppendEventRequest["event"];

type StoredSession = {
  id: string;
  appName: string;
  userId: string;
  state: Record<string, unknown>;
  events: StoredEvent[];
  lastUpdateTime: number;
};

const MAX_SESSIONS = 40;
const MAX_EVENTS = 80;

function storageKey(appName: string, userId: string, sessionId: string) {
  return `${appName}\u0000${userId}\u0000${sessionId}`;
}

function parseScopedUser(scopedUser: string): { farmId: string; userId: string } | null {
  const idx = scopedUser.indexOf(":");
  if (idx <= 0 || idx === scopedUser.length - 1) return null;
  return { farmId: scopedUser.slice(0, idx), userId: scopedUser.slice(idx + 1) };
}

/**
 * Postgres-backed ADK session store for multi-instance / serverless production deployments.
 */
export class PostgresSessionService extends InMemorySessionService {
  private hydratedIds = new Set<string>();

  async whenReady() {
    // Queries Postgres lazily per session so pods stay synchronized.
  }

  override async createSession(request: CreateSessionRequest) {
    const session = await super.createSession(request);
    this.hydratedIds.add(session.id);
    const scope = parseScopedUser(session.userId);
    if (scope) {
      try {
        await db
          .insert(aiSessions)
          .values({
            id: session.id,
            farmId: scope.farmId,
            userId: scope.userId,
            appName: session.appName,
            stateJson: session.state ?? {},
            eventsJson: [],
            messagesJson: [],
            updatedAt: new Date(),
          })
          .onConflictDoNothing();
      } catch {
        // Keep in-memory fallback if DB write is unavailable
      }
    }
    return session;
  }

  override async getSession(request: GetSessionRequest) {
    const existing = await super.getSession(request);
    if (existing) return existing;

    const scope = parseScopedUser(request.userId);
    if (!scope || this.hydratedIds.has(request.sessionId)) return undefined;

    try {
      const [row] = await db
        .select()
        .from(aiSessions)
        .where(
          and(
            eq(aiSessions.id, request.sessionId),
            eq(aiSessions.farmId, scope.farmId),
            eq(aiSessions.userId, scope.userId),
            eq(aiSessions.appName, request.appName),
          ),
        )
        .limit(1);
      if (!row) return undefined;

      this.hydratedIds.add(row.id);
      await super.createSession({
        appName: row.appName,
        userId: request.userId,
        sessionId: row.id,
        state: (row.stateJson as Record<string, unknown>) ?? {},
      });
      let session = await super.getSession(request);
      const events = Array.isArray(row.eventsJson) ? (row.eventsJson as StoredEvent[]) : [];
      for (const event of events.slice(-MAX_EVENTS)) {
        if (!session) break;
        try {
          await super.appendEvent({ session, event });
          session = (await super.getSession(request)) ?? session;
        } catch {
          continue;
        }
      }
      return session;
    } catch {
      return undefined;
    }
  }

  override async appendEvent(request: AppendEventRequest) {
    const event = await super.appendEvent(request);
    if (event.partial) return event;

    const scope = parseScopedUser(request.session.userId);
    if (scope) {
      try {
        const [row] = await db
          .select({ eventsJson: aiSessions.eventsJson })
          .from(aiSessions)
          .where(and(eq(aiSessions.id, request.session.id), eq(aiSessions.farmId, scope.farmId), eq(aiSessions.userId, scope.userId)))
          .limit(1);
        const prevEvents = Array.isArray(row?.eventsJson) ? (row.eventsJson as StoredEvent[]) : [];
        const nextEvents = [...prevEvents, event].slice(-MAX_EVENTS);
        await db
          .update(aiSessions)
          .set({
            stateJson: request.session.state ?? {},
            eventsJson: nextEvents,
            updatedAt: new Date(),
          })
          .where(and(eq(aiSessions.id, request.session.id), eq(aiSessions.farmId, scope.farmId), eq(aiSessions.userId, scope.userId)));
      } catch {
        // Ignore persistence failures on non-critical event flush
      }
    }
    return event;
  }
}

/**
 * Local JSON-file-backed session store (retained for lightweight local & test persistence).
 */
export class DurableSessionService extends InMemorySessionService {
  private records = new Map<string, StoredSession>();
  private ready: Promise<void>;

  constructor(private readonly filePath: string) {
    super();
    this.ready = this.restore();
  }

  async whenReady() {
    await this.ready;
  }

  override async createSession(request: CreateSessionRequest) {
    await this.ready;
    const session = await super.createSession(request);
    this.records.set(storageKey(session.appName, session.userId, session.id), {
      id: session.id,
      appName: session.appName,
      userId: session.userId,
      state: session.state ?? {},
      events: [],
      lastUpdateTime: session.lastUpdateTime,
    });
    this.flush();
    return session;
  }

  override async getSession(request: GetSessionRequest) {
    await this.ready;
    return super.getSession(request);
  }

  override async appendEvent(request: AppendEventRequest) {
    await this.ready;
    const event = await super.appendEvent(request);
    if (event.partial) return event;
    const key = storageKey(request.session.appName, request.session.userId, request.session.id);
    const stored = this.records.get(key);
    if (!stored) return event;
    stored.events = [...stored.events, event].slice(-MAX_EVENTS);
    stored.lastUpdateTime = event.timestamp;
    stored.state = request.session.state ?? stored.state;
    this.flush();
    return event;
  }

  private async restore() {
    let rows: StoredSession[] = [];
    try {
      rows = JSON.parse(readFileSync(this.filePath, "utf8")) as StoredSession[];
    } catch {
      return;
    }
    for (const row of rows.slice(-MAX_SESSIONS)) {
      try {
        await super.createSession({
          appName: row.appName,
          userId: row.userId,
          sessionId: row.id,
          state: row.state,
        });
        let session = await super.getSession({ appName: row.appName, userId: row.userId, sessionId: row.id });
        for (const event of row.events ?? []) {
          if (!session) break;
          await super.appendEvent({ session, event });
          session = (await super.getSession({ appName: row.appName, userId: row.userId, sessionId: row.id })) ?? session;
        }
        this.records.set(storageKey(row.appName, row.userId, row.id), {
          ...row,
          events: (row.events ?? []).slice(-MAX_EVENTS),
        });
      } catch {
        continue;
      }
    }
  }

  private flush() {
    const kept = [...this.records.values()].sort((a, b) => a.lastUpdateTime - b.lastUpdateTime).slice(-MAX_SESSIONS);
    const keptKeys = new Set(kept.map((item) => storageKey(item.appName, item.userId, item.id)));
    for (const key of this.records.keys()) {
      if (!keptKeys.has(key)) this.records.delete(key);
    }
    try {
      const dir = dirname(this.filePath);
      mkdirSync(dir, { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(kept));
      renameSync(tmp, this.filePath);
    } catch {
      // Ignore write failures on read-only serverless filesystems; in-memory sessions still work.
    }
  }
}

export async function loadLatestUserChat(farmId: string, userId: string) {
  const [row] = await db
    .select({ id: aiSessions.id, messagesJson: aiSessions.messagesJson })
    .from(aiSessions)
    .where(and(eq(aiSessions.farmId, farmId), eq(aiSessions.userId, userId)))
    .orderBy(desc(aiSessions.updatedAt))
    .limit(1);
  if (!row) return { sessionId: null as string | null, messages: [] as unknown[] };
  return {
    sessionId: row.id,
    messages: Array.isArray(row.messagesJson) ? row.messagesJson : [],
  };
}

export async function saveUserChatMessages(farmId: string, userId: string, sessionId: string, messages: unknown[]) {
  const trimmed = messages.slice(-60);
  await db
    .update(aiSessions)
    .set({ messagesJson: trimmed, updatedAt: new Date() })
    .where(and(eq(aiSessions.id, sessionId), eq(aiSessions.farmId, farmId), eq(aiSessions.userId, userId)));
}

export async function countMonthlyAiSessions(farmId: string) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({ total: count() })
    .from(aiSessions)
    .where(and(eq(aiSessions.farmId, farmId), gte(aiSessions.updatedAt, monthStart)));
  return Number(row?.total ?? 0);
}

export function sessionFilePath() {
  const databaseUrl = process.env.DATABASE_URL ?? "pglite:.data/pglite";
  const dataDir = databaseUrl.startsWith("pglite:") ? databaseUrl.slice("pglite:".length) : ".data/pglite";
  const parent = dirname(dataDir);
  return join(parent === "." ? ".data" : parent, "ai-sessions.json");
}
