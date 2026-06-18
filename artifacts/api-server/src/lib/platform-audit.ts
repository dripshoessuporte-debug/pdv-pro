import { db, platformAuditLogsTable } from "@workspace/db";

type AuditActor =
  | { id?: number | null; email?: string | null }
  | null
  | undefined;

export async function logPlatformAuditAction(
  actor: AuditActor,
  action: string,
  targetType?: string | null,
  targetId?: string | number | null,
  metadata?: unknown,
): Promise<void> {
  await db.insert(platformAuditLogsTable).values({
    actorUserId: actor?.id ?? null,
    actorEmail: actor?.email ?? null,
    action,
    targetType: targetType ?? null,
    targetId: targetId == null ? null : String(targetId),
    metadata: metadata == null ? null : (metadata as Record<string, unknown>),
  });
}
