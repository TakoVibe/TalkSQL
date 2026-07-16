import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { dataConnections } from "@/db/schema";
import { getAppDb } from "@/lib/app-db";
import { encryptConnectionCredentials } from "@/lib/connection-secrets";
import type { ConnectionInput } from "@/lib/database";
import { closeDatabasePools, type ConnectionHealth } from "@/lib/database-adapters";

export async function saveConnection(organizationId: string, input: ConnectionInput, health?: ConnectionHealth) {
  const id = randomUUID();
  const name = `${input.database} (${input.engine === "postgresql" ? "Postgres" : "MySQL"})`;
  await getAppDb().insert(dataConnections).values({
    id,
    organizationId,
    name,
    engine: input.engine,
    host: input.host,
    port: input.port ?? (input.engine === "postgresql" ? 5432 : 3306),
    database: input.database,
    ssl: input.ssl,
    encryptedCredentials: encryptConnectionCredentials({ username: input.username, password: input.password }),
    healthCheckedAt: health ? new Date() : null,
    healthLatencyMs: health?.latencyMs,
    readOnlyVerifiedAt: health?.readOnlyVerified ? new Date() : null,
    credentialsRotatedAt: new Date(),
  });
  return { id, name };
}

export async function getConnectionForOrganization(organizationId: string, connectionId: string) {
  const [connection] = await getAppDb().select().from(dataConnections).where(and(eq(dataConnections.id, connectionId), eq(dataConnections.organizationId, organizationId))).limit(1);
  return connection ?? null;
}

export async function listConnectionsForOrganization(organizationId: string) {
  return getAppDb().select({ id: dataConnections.id, name: dataConnections.name, engine: dataConnections.engine, database: dataConnections.database, host: dataConnections.host, port: dataConnections.port, ssl: dataConnections.ssl, status: dataConnections.status, schemaSyncedAt: dataConnections.schemaSyncedAt, healthCheckedAt: dataConnections.healthCheckedAt, healthLatencyMs: dataConnections.healthLatencyMs, readOnlyVerifiedAt: dataConnections.readOnlyVerifiedAt, credentialsRotatedAt: dataConnections.credentialsRotatedAt }).from(dataConnections).where(eq(dataConnections.organizationId, organizationId));
}

/** Snapshot is cleared: new credentials may point at a different database. */
export async function updateConnectionForOrganization(organizationId: string, connectionId: string, input: ConnectionInput, health?: ConnectionHealth) {
  const name = `${input.database} (${input.engine === "postgresql" ? "Postgres" : "MySQL"})`;
  await getAppDb().update(dataConnections).set({
    name,
    engine: input.engine,
    host: input.host,
    port: input.port ?? (input.engine === "postgresql" ? 5432 : 3306),
    database: input.database,
    ssl: input.ssl,
    encryptedCredentials: encryptConnectionCredentials({ username: input.username, password: input.password }),
    status: "connected",
    healthCheckedAt: health ? new Date() : null,
    healthLatencyMs: health?.latencyMs,
    readOnlyVerifiedAt: health?.readOnlyVerified ? new Date() : null,
    credentialsRotatedAt: new Date(),
    schemaSnapshot: null,
    schemaSyncedAt: null,
    updatedAt: new Date(),
  }).where(and(eq(dataConnections.id, connectionId), eq(dataConnections.organizationId, organizationId)));
  closeDatabasePools(connectionId);
}

export async function updateConnectionHealth(organizationId: string, connectionId: string, health: { status: string; latencyMs?: number; readOnlyVerified?: boolean }) {
  await getAppDb().update(dataConnections).set({
    status: health.status,
    healthCheckedAt: new Date(),
    healthLatencyMs: health.latencyMs,
    readOnlyVerifiedAt: health.readOnlyVerified === undefined ? undefined : health.readOnlyVerified ? new Date() : null,
    updatedAt: new Date(),
  }).where(and(eq(dataConnections.id, connectionId), eq(dataConnections.organizationId, organizationId)));
}

export async function deleteConnectionForOrganization(organizationId: string, connectionId: string) {
  await getAppDb().delete(dataConnections).where(and(eq(dataConnections.id, connectionId), eq(dataConnections.organizationId, organizationId)));
  closeDatabasePools(connectionId);
}
