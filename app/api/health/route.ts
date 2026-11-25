import { sql } from "drizzle-orm";
import { db } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({
      ok: true,
      db: "connected",
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        db: "unreachable",
        error: error instanceof Error ? error.message : "Database check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
