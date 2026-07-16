import "server-only";

import { mysqlAdapter } from "./mysql";
import { postgresqlAdapter } from "./postgresql";
import { DatabaseGuardrailError, type DatabaseAdapter, type DatabaseEngine } from "./types";

const adapters: Record<DatabaseEngine, DatabaseAdapter> = {
  postgresql: postgresqlAdapter,
  mysql: mysqlAdapter,
};

export function getDatabaseAdapter(engine: string): DatabaseAdapter {
  if (engine === "postgresql" || engine === "mysql") return adapters[engine];
  throw new DatabaseGuardrailError("Unsupported database engine.", { code: "UNSUPPORTED_DATABASE", status: 400 });
}

export function closeDatabasePools(connectionId: string) {
  for (const adapter of Object.values(adapters)) adapter.closePool(connectionId);
}

export * from "./types";
