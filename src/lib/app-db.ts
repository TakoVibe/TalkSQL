import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

let pool: Pool | undefined;

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  pool ??= new Pool({ connectionString, max: 10, ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: true } });
  return pool;
}

export function getAppDb() {
  return drizzle({ client: getPool(), schema });
}
