import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { InMemorySessionService } from "@google/adk";
import type { AppendEventRequest, CreateSessionRequest, GetSessionRequest } from "@google/adk";

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
    const rows = [...this.records.values()].sort((a, b) => a.lastUpdateTime - b.lastUpdateTime).slice(-MAX_SESSIONS);
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(rows));
  }
}

export function sessionFilePath() {
  const databaseUrl = process.env.DATABASE_URL ?? "pglite:.data/pglite";
  const dataDir = databaseUrl.startsWith("pglite:") ? databaseUrl.slice("pglite:".length) : ".data/pglite";
  return `${dirname(dataDir)}/ai-sessions.json`;
}
