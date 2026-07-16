import "server-only";

import { createHash } from "node:crypto";

import type { DatabaseCredentials, DatabaseTarget, QueryPolicy } from "./types";

function digest(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** Stable per saved connection; credentials deliberately never appear in the key. */
export function poolKey(target: DatabaseTarget, credentials: DatabaseCredentials) {
  return target.connectionId ?? digest([target.engine, target.host, target.port, target.database, credentials.username]).slice(0, 24);
}

/** A rotation changes the fingerprint and causes the old pool to be drained. */
export function poolFingerprint(target: DatabaseTarget, credentials: DatabaseCredentials, policy?: QueryPolicy) {
  return digest([target.engine, target.host, target.port, target.database, target.ssl, credentials.username, credentials.password, policy?.maxConcurrentPerDatabase, policy?.poolIdleTimeoutMs, policy?.poolMaxLifetimeSeconds]);
}
