import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { workspaceQuerySettings } from "@/db/schema";
import { getAppDb } from "@/lib/app-db";
import type { QueryPolicy } from "@/lib/database-adapters";
import { QUERY_POLICY } from "@/lib/query-policy";

export const workspaceQuerySettingsSchema = z.object({
  enforceReadOnlyRole: z.boolean(),
  requireTls: z.boolean(),
  enableCostWarnings: z.boolean(),
  statementTimeoutMs: z.number().int().min(1_000).max(120_000),
  queueTimeoutMs: z.number().int().min(1_000).max(30_000),
  maxRows: z.number().int().min(10).max(1_000),
  maxConcurrent: z.number().int().min(1).max(10),
  warnEstimatedRows: z.number().int().min(1_000).max(100_000_000),
});

export type WorkspaceQuerySettings = z.infer<typeof workspaceQuerySettingsSchema>;

export const DEFAULT_WORKSPACE_QUERY_SETTINGS: WorkspaceQuerySettings = {
  enforceReadOnlyRole: QUERY_POLICY.enforceReadOnlyRole,
  requireTls: QUERY_POLICY.requireTls,
  enableCostWarnings: QUERY_POLICY.enableCostWarnings,
  statementTimeoutMs: QUERY_POLICY.statementTimeoutMs,
  queueTimeoutMs: QUERY_POLICY.queueTimeoutMs,
  maxRows: QUERY_POLICY.maxRows,
  maxConcurrent: QUERY_POLICY.maxConcurrentPerDatabase,
  warnEstimatedRows: QUERY_POLICY.warnEstimatedRows,
};

export async function getWorkspaceQuerySettings(organizationId: string): Promise<WorkspaceQuerySettings> {
  const [stored] = await getAppDb().select().from(workspaceQuerySettings).where(eq(workspaceQuerySettings.organizationId, organizationId)).limit(1);
  if (!stored) return { ...DEFAULT_WORKSPACE_QUERY_SETTINGS };
  return {
    enforceReadOnlyRole: stored.enforceReadOnlyRole,
    requireTls: stored.requireTls,
    enableCostWarnings: stored.enableCostWarnings,
    statementTimeoutMs: stored.statementTimeoutMs,
    queueTimeoutMs: stored.queueTimeoutMs,
    maxRows: stored.maxRows,
    maxConcurrent: stored.maxConcurrent,
    warnEstimatedRows: stored.warnEstimatedRows,
  };
}

export async function getQueryPolicyForOrganization(organizationId?: string | null): Promise<QueryPolicy> {
  if (!organizationId) return QUERY_POLICY;
  const settings = await getWorkspaceQuerySettings(organizationId);
  return {
    ...QUERY_POLICY,
    enforceReadOnlyRole: settings.enforceReadOnlyRole,
    requireTls: settings.requireTls,
    enableCostWarnings: settings.enableCostWarnings,
    statementTimeoutMs: settings.statementTimeoutMs,
    wallClockTimeoutMs: Math.max(QUERY_POLICY.wallClockTimeoutMs, settings.statementTimeoutMs + 7_000),
    queueTimeoutMs: settings.queueTimeoutMs,
    maxRows: settings.maxRows,
    maxConcurrentPerDatabase: settings.maxConcurrent,
    warnEstimatedRows: settings.warnEstimatedRows,
  };
}

export async function saveWorkspaceQuerySettings(organizationId: string, input: unknown): Promise<WorkspaceQuerySettings> {
  const settings = workspaceQuerySettingsSchema.parse(input);
  await getAppDb().insert(workspaceQuerySettings).values({ organizationId, ...settings, updatedAt: new Date() }).onConflictDoUpdate({
    target: workspaceQuerySettings.organizationId,
    set: { ...settings, updatedAt: new Date() },
  });
  return settings;
}
