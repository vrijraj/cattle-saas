import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { farms } from "@/db/schema";
import { runDailyAutomationForFarm } from "@/lib/daily-automation";

export const runtime = "nodejs";

function verifyCronSecret(request: Request) {
  const configured = process.env.CRON_SECRET;
  if (!configured) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const querySecret = new URL(request.url).searchParams.get("secret") ?? "";
  const candidate = bearer || querySecret;
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sendDigest = new URL(request.url).searchParams.get("digest") !== "0";
  const allFarms = await db.select({ id: farms.id, subscriptionStatus: farms.subscriptionStatus }).from(farms);
  const results = [];
  for (const farm of allFarms) {
    if (farm.subscriptionStatus === "suspended") continue;
    const summary = await runDailyAutomationForFarm(farm.id, { sendDigest });
    if (summary) results.push(summary);
  }

  return NextResponse.json({ ok: true, farmsProcessed: results.length, results });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
