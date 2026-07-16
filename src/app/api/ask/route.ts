import { randomUUID } from "node:crypto";
import { z } from "zod";

import { askLog } from "@/db/schema";
import { getAppDb } from "@/lib/app-db";
import { getConnectionForOrganization } from "@/lib/connection-store";
import { executeReadOnlyQuery, looksReadOnlySelect, serializeQueryError } from "@/lib/query-runner";
import { getQueryPolicyForOrganization } from "@/lib/query-settings";
import { getSchemaSnapshot, type SchemaSnapshot } from "@/lib/schema-discovery";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";

const intentSchema = z.object({
  kind: z.enum(["metric", "table", "chart", "schema_diagram", "clarify"]),
  title: z.string(),
  sql: z.string().nullable(),
  chartType: z.enum(["bar", "line", "area", "pie"]).nullable().catch(null),
  xColumn: z.string().nullable(),
  yColumn: z.string().nullable(),
  focusTables: z.array(z.string()).nullable(),
  clarifyQuestion: z.string().nullable(),
});
export type AskIntent = z.infer<typeof intentSchema>;

const INTENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["metric", "table", "chart", "schema_diagram", "clarify"] },
    title: { type: "string" },
    sql: { type: ["string", "null"] },
    chartType: { type: ["string", "null"] },
    xColumn: { type: ["string", "null"] },
    yColumn: { type: ["string", "null"] },
    focusTables: { type: ["array", "null"], items: { type: "string" } },
    clarifyQuestion: { type: ["string", "null"] },
  },
  required: ["kind", "title", "sql", "chartType", "xColumn", "yColumn", "focusTables", "clarifyQuestion"],
};

const MAX_TOOL_STEPS = 5;
const TOOL_ROW_CAP = 20;

function focusSchema(schema: SchemaSnapshot, focusTables: string[] | null): SchemaSnapshot {
  if (!focusTables?.length) return schema;
  const names = new Set(focusTables);
  for (const relation of schema.relationships) if (names.has(relation.fromTable) || names.has(relation.toTable)) { names.add(relation.fromTable); names.add(relation.toTable); }
  return {
    tables: schema.tables.filter((table) => names.has(table.name)),
    columns: schema.columns.filter((column) => names.has(column.table)),
    relationships: schema.relationships.filter((relation) => names.has(relation.fromTable) && names.has(relation.toTable)),
  };
}

export async function POST(request: Request) {
  const { question, connectionId } = await request.json() as { question?: string; connectionId?: string };
  if (!question || !connectionId) return Response.json({ error: "Question and connection are required." }, { status: 400 });
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const connection = await getConnectionForOrganization(organizationId, connectionId);
  if (!connection) return Response.json({ error: "Connection not found." }, { status: 404 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const queryPolicy = await getQueryPolicyForOrganization(organizationId);

  const startedAt = performance.now();
  async function log(entry: { kind?: string; sql?: string; ok: boolean; error?: string }) {
    try {
      await getAppDb().insert(askLog).values({ id: randomUUID(), organizationId: organizationId!, connectionId: connectionId!, question: question!, durationMs: Math.round(performance.now() - startedAt), ...entry });
    } catch (error) { console.error("ask_log insert failed", error); }
  }

  const schema = await getSchemaSnapshot(connection);
  const prompt = `You translate questions about a ${connection.engine === "postgresql" ? "PostgreSQL" : "MySQL"} database into a response plan.
Pick "kind":
- "metric": the answer is a single number (counts, totals, averages). sql must return one row.
- "chart": the answer is a comparison or trend over groups/time. Set chartType, xColumn and yColumn matching the sql output columns. chartType: "bar" for comparisons, "line" or "area" for trends over time, "pie" only for share-of-a-total across at most 8 categories.
- "table": the answer is a list of rows.
- "schema_diagram": the question is about database structure or table relationships. Set focusTables to the relevant table names (null for the whole schema). No sql.
- "clarify": the question is too ambiguous to answer safely. Set clarifyQuestion. No sql.
Rules for sql: one read-only SELECT (WITH allowed), never modify data, do not add LIMIT unless the question asks for a specific number of rows (the system caps results at ${queryPolicy.maxRows} rows). Give every result column a clear alias. title: a short human title for the answer.
You may call run_query to inspect real data before answering — check distinct values, value formats, or test your query. Tool results are capped at ${TOOL_ROW_CAP} rows. When confident, return the final JSON answer.
Schema: ${JSON.stringify(schema)}
Question: ${question}`;

  const tools = [{
    type: "function",
    name: "run_query",
    strict: true,
    description: `Run one read-only SELECT against the connected ${connection.engine} database to inspect real data (distinct values, value formats, row samples) before writing the final answer. Results are capped at ${TOOL_ROW_CAP} rows.`,
    parameters: { type: "object", additionalProperties: false, properties: { sql: { type: "string", description: "A single read-only SELECT statement (WITH allowed). No trailing semicolon." } }, required: ["sql"] },
  }];

  async function runQueryTool(rawArguments: string | undefined): Promise<string> {
    let toolSql = "";
    try { toolSql = String((JSON.parse(rawArguments ?? "{}") as { sql?: unknown }).sql ?? "").trim().replace(/;+\s*$/, ""); } catch { /* malformed arguments fall through to the guard below */ }
    if (!toolSql || !looksReadOnlySelect(toolSql)) return JSON.stringify({ error: "Only a single read-only SELECT is allowed." });
    try {
      const result = await executeReadOnlyQuery(connection!, toolSql, { signal: request.signal });
      return JSON.stringify({ columns: result.columns, rows: result.rows.slice(0, TOOL_ROW_CAP), truncated: result.truncated || result.rows.length > TOOL_ROW_CAP });
    } catch (error) { return JSON.stringify({ error: error instanceof Error ? error.message : "Query failed." }); }
  }

  type ResponsesOutputItem = { type: string; call_id?: string; arguments?: string; content?: Array<{ type: string; text?: string }> };
  let requestInput: unknown = prompt;
  let previousResponseId: string | undefined;
  let raw = "";
  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]), // ponytail: minimal effort — schema-grounded SQL needs no deep reasoning; raise to "low" if quality slips
body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? "gpt-5", reasoning: { effort: "minimal" }, input: requestInput, previous_response_id: previousResponseId, tools, text: { format: { type: "json_schema", name: "talksql_intent", strict: true, schema: INTENT_JSON_SCHEMA } } }) });
    const data = await response.json() as { id?: string; output_text?: string; output?: ResponsesOutputItem[]; error?: { message?: string } };
    if (!response.ok) {
      await log({ ok: false, error: data.error?.message ?? "OpenAI request failed." });
      return Response.json({ error: data.error?.message ?? "OpenAI could not generate a response." }, { status: 422 });
    }
    const calls = (data.output ?? []).filter((item) => item.type === "function_call");
    if (!calls.length) {
      // The raw Responses API nests text under output[].content[]; output_text only exists in the SDKs.
      raw = (data.output_text ?? data.output?.filter((item) => item.type === "message").flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("") ?? "").trim();
      break;
    }
    previousResponseId = data.id;
    requestInput = await Promise.all(calls.map(async (call) => ({ type: "function_call_output", call_id: call.call_id, output: await runQueryTool(call.arguments) })));
  }
  if (!raw) {
    await log({ ok: false, error: "Tool-call limit reached without a final answer." });
    return Response.json({ error: "Could not produce an answer. Try rephrasing the question." }, { status: 422 });
  }
  const parsed = intentSchema.safeParse(raw ? JSON.parse(raw) : undefined);
  if (!parsed.success) {
    await log({ ok: false, error: "Intent parse failed." });
    return Response.json({ error: "Could not understand the model response. Try rephrasing." }, { status: 422 });
  }
  const intent = parsed.data;

  if (intent.kind === "clarify") {
    await log({ kind: intent.kind, ok: true });
    return Response.json({ kind: intent.kind, title: intent.title, clarifyQuestion: intent.clarifyQuestion ?? "Can you make the question more specific?" });
  }

  if (intent.kind === "schema_diagram") {
    await log({ kind: intent.kind, ok: true });
    return Response.json({ kind: intent.kind, title: intent.title, focusTables: intent.focusTables, schema: focusSchema(schema, intent.focusTables) });
  }

  const sql = intent.sql?.trim().replace(/;+\s*$/, "") ?? "";
  if (!sql || !looksReadOnlySelect(sql)) {
    await log({ kind: intent.kind, sql, ok: false, error: "Rejected by read-only filter." });
    return Response.json({ error: "The generated response was not a single safe SELECT query." }, { status: 422 });
  }
  try {
    const result = await executeReadOnlyQuery(connection, sql, { signal: request.signal });
    await log({ kind: intent.kind, sql, ok: true });
    return Response.json({ kind: intent.kind, title: intent.title, sql, chartType: intent.chartType, xColumn: intent.xColumn, yColumn: intent.yColumn, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed.";
    await log({ kind: intent.kind, sql, ok: false, error: message });
    const serialized = serializeQueryError(error);
    return Response.json({ sql, ...serialized.body }, { status: serialized.status });
  }
}
