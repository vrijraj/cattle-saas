import { auditLogs } from "@/db/schema";

type AuditWriter = {
  insert: typeof import("@/db").db.insert;
};

export async function writeAudit(
  tx: AuditWriter,
  entry: {
    farmId: string;
    actorId: string;
    action: "create" | "update" | "void" | "export";
    entity: string;
    entityId: string;
    summary: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.insert(auditLogs).values({
    farmId: entry.farmId,
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    summary: entry.summary,
    beforeState: entry.before ?? null,
    afterState: entry.after ?? null,
  });
}
