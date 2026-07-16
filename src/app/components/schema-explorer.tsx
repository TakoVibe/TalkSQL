"use client";

import { useEffect, useId, useMemo, useState } from "react";

export type Snapshot = { tables: { schema: string; name: string }[]; columns: { table: string; name: string; type: string; nullable: boolean }[]; relationships: { fromTable: string; fromColumn: string; toTable: string; toColumn: string }[] };

const CARD_W = 240, HEADER_H = 34, ROW_H = 26, GAP = 48;

export function SchemaDiagram({ schema }: { schema: Snapshot }) {
  const markerId = `er-arrow-${useId().replaceAll(":", "")}`;
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeRelationship, setActiveRelationship] = useState<number | null>(null);
  const layout = useMemo(() => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(schema.tables.length)));
    const heights = Array.from({ length: cols }, () => 0);
    const cards = new Map<string, { x: number; y: number; columns: Snapshot["columns"] }>();
    for (const t of schema.tables) {
      const columns = schema.columns.filter((c) => c.table === t.name);
      const col = heights.indexOf(Math.min(...heights));
      cards.set(t.name, { x: col * (CARD_W + GAP), y: heights[col], columns });
      heights[col] += HEADER_H + columns.length * ROW_H + GAP;
    }
    return { cards, width: cols * (CARD_W + GAP) - GAP, height: Math.max(...heights) - GAP };
  }, [schema]);
  const fkCols = useMemo(() => new Set(schema.relationships.map((r) => `${r.fromTable}.${r.fromColumn}`)), [schema]);
  const activeTable = hoveredTable ?? selectedTable;
  const activeRelation = activeRelationship == null ? undefined : schema.relationships[activeRelationship];
  const highlightedTables = useMemo(() => {
    if (activeRelation) return new Set([activeRelation.fromTable, activeRelation.toTable]);
    if (!activeTable) return undefined;
    const names = new Set([activeTable]);
    schema.relationships.forEach((relationship) => {
      if (relationship.fromTable === activeTable) names.add(relationship.toTable);
      if (relationship.toTable === activeTable) names.add(relationship.fromTable);
    });
    return names;
  }, [activeRelation, activeTable, schema.relationships]);
  const rowY = (card: { y: number; columns: Snapshot["columns"] }, name: string) => card.y + HEADER_H + Math.max(0, card.columns.findIndex((c) => c.name === name)) * ROW_H + ROW_H / 2;
  const interactionLabel = activeRelation
    ? `${activeRelation.fromTable}.${activeRelation.fromColumn} links to ${activeRelation.toTable}.${activeRelation.toColumn}`
    : activeTable
      ? `${activeTable}: ${layout.cards.get(activeTable)?.columns.length ?? 0} columns · ${schema.relationships.filter((relationship) => relationship.fromTable === activeTable || relationship.toTable === activeTable).length} relationships`
      : "Hover, focus, or select a table to highlight its relationships.";
  return (
    <div className="mt-6 max-h-[70vh] overflow-auto rounded-xl border border-[var(--border)] bg-[#fbfcfa]">
      <div className="sticky left-0 top-0 z-20 flex min-h-11 items-center border-b border-[var(--border)] bg-[var(--surface)]/95 px-4 py-2 text-xs text-[var(--ink-muted)] backdrop-blur" role="status" aria-live="polite">
        <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]" />{interactionLabel}
        {(selectedTable || activeRelationship != null) && <button type="button" onClick={() => { setSelectedTable(null); setActiveRelationship(null); }} className="ml-auto min-h-11 rounded-lg px-3 font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]">Clear</button>}
      </div>
      <div className="relative m-8" style={{ width: layout.width, height: layout.height }}>
        <svg className="absolute inset-0 overflow-visible" width={layout.width} height={layout.height} aria-label="Interactive database relationship graph">
          <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="#27704f" /></marker></defs>
          {schema.relationships.map((r, relationshipIndex) => {
            const from = layout.cards.get(r.fromTable), to = layout.cards.get(r.toTable);
            if (!from || !to) return null;
            const y1 = rowY(from, r.fromColumn), y2 = rowY(to, r.toColumn);
            const sideBySide = to.x >= from.x + CARD_W || from.x >= to.x + CARD_W;
            // ponytail: same-column edges loop out the right side
            const x1 = sideBySide && to.x < from.x ? from.x : from.x + CARD_W;
            const x2 = sideBySide && to.x > from.x ? to.x : to.x + CARD_W;
            const bend = sideBySide ? (x1 + x2) / 2 : Math.max(x1, x2) + 40;
            const path = `M ${x1} ${y1} C ${bend} ${y1}, ${bend} ${y2}, ${x2} ${y2}`;
            const relatedToActiveTable = !activeTable || r.fromTable === activeTable || r.toTable === activeTable;
            const active = activeRelationship === relationshipIndex;
            return <g key={`${r.fromTable}.${r.fromColumn}→${r.toTable}.${r.toColumn}`}>
              <path d={path} fill="none" stroke="transparent" strokeWidth="14" tabIndex={0} role="img" aria-label={`${r.fromTable}.${r.fromColumn} links to ${r.toTable}.${r.toColumn}`} className="cursor-pointer outline-none focus-visible:stroke-[#8fd4ae]/50" onPointerEnter={() => setActiveRelationship(relationshipIndex)} onPointerLeave={() => setActiveRelationship(null)} onFocus={() => setActiveRelationship(relationshipIndex)} onBlur={() => setActiveRelationship(null)} onClick={() => setActiveRelationship(active ? null : relationshipIndex)} />
              <path d={path} fill="none" stroke="#27704f" strokeWidth={active ? 3 : 1.5} opacity={active ? 1 : relatedToActiveTable ? 0.7 : 0.12} markerEnd={`url(#${markerId})`} pointerEvents="none" className="transition-[opacity,stroke-width] duration-200" />
            </g>;
          })}
        </svg>
        {schema.tables.map((t) => {
          const card = layout.cards.get(t.name);
          if (!card) return null;
          const highlighted = !highlightedTables || highlightedTables.has(t.name);
          const active = activeTable === t.name || activeRelation?.fromTable === t.name || activeRelation?.toTable === t.name;
          const relationshipCount = schema.relationships.filter((relationship) => relationship.fromTable === t.name || relationship.toTable === t.name).length;
          return (
            <button type="button" key={`${t.schema}.${t.name}`} onPointerEnter={() => setHoveredTable(t.name)} onPointerLeave={() => setHoveredTable(null)} onFocus={() => setHoveredTable(t.name)} onBlur={() => setHoveredTable(null)} onClick={() => setSelectedTable(selectedTable === t.name ? null : t.name)} aria-pressed={selectedTable === t.name} aria-label={`${t.name} table, ${card.columns.length} columns, ${relationshipCount} relationships`} className={`absolute cursor-pointer rounded-lg border bg-white text-left shadow-sm outline-none transition-[opacity,transform,box-shadow,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${active ? "z-10 -translate-y-1 border-[var(--brand)] shadow-lg" : "border-[var(--border)] hover:-translate-y-0.5 hover:border-[var(--brand-border)] hover:shadow-md"}`} style={{ left: card.x, top: card.y, width: CARD_W, opacity: highlighted ? 1 : 0.32 }}>
              <div className="truncate rounded-t-lg bg-[#205b43] px-3 text-sm font-semibold text-white" style={{ height: HEADER_H, lineHeight: `${HEADER_H}px` }} title={`${t.schema}.${t.name}`}>{t.name}</div>
              {card.columns.map((c) => (
                <div key={c.name} className="flex items-center justify-between border-t px-3 text-xs" style={{ height: ROW_H }}>
                  <span className={`truncate font-medium ${fkCols.has(`${t.name}.${c.name}`) ? "text-[#27704f]" : ""}`}>{c.name}{c.nullable ? "" : " *"}</span>
                  <span className="ml-2 shrink-0 text-[#8b948e]">{c.type}</span>
                </div>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SchemaExplorer({ connectionId }: { connectionId?: string }) {
  const id = connectionId ?? "";
  const [schema, setSchema] = useState<Snapshot>();
  const [table, setTable] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "diagram">("list");
  const [showRelated, setShowRelated] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!id) return; fetch(`/api/connections/${id}/schema`).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setSchema(d); setTable(d.tables[0]?.name ?? ""); }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Schema discovery failed.")); }, [id]);
  const matches = useMemo(() => { const q = search.toLowerCase(); return (schema?.tables ?? []).filter((t) => !q || t.name.toLowerCase().includes(q) || schema?.columns.some((c) => c.table === t.name && c.name.toLowerCase().includes(q))); }, [schema, search]);
  const columns = schema?.columns.filter((c) => c.table === table) ?? [];
  const relations = schema?.relationships.filter((r) => r.fromTable === table || r.toTable === table) ?? [];
  const relatedNames = new Set(relations.flatMap((r) => [r.fromTable, r.toTable]));
  const relatedSchema: Snapshot = { tables: schema?.tables.filter((t) => relatedNames.has(t.name)) ?? [], columns: schema?.columns.filter((c) => relatedNames.has(c.table)) ?? [], relationships: relations };
  if (!id) return <p className="mt-6 rounded-xl border border-dashed border-[#cfd7d1] bg-white p-8 text-center text-sm text-[#66716b]">Pick a connection in the top bar to explore its schema.</p>;
  if (error) return <p className="mt-5 text-red-700">{error}</p>;
  if (!schema) return (
    <div className="mt-6 grid overflow-hidden rounded-2xl border border-[#dfe4df] bg-white lg:grid-cols-[300px_1fr]" aria-busy="true" aria-label="Reading schema">
      <div className="space-y-2 border-b border-[#dfe4df] bg-[#fafcf9] p-4 lg:border-r lg:border-b-0"><div className="skeleton h-9 w-full" />{[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton h-8 w-full" style={{ opacity: 1 - i * 0.1 }} />)}</div>
      <div className="p-7"><div className="skeleton h-7 w-48" /><div className="skeleton mt-6 h-64 w-full" /><div className="skeleton mt-6 h-4 w-32" /><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="skeleton h-12" /><div className="skeleton h-12" /></div></div>
    </div>
  );
  const toggle = <div className="mt-6 inline-flex rounded-lg border border-[#cfd7d1] bg-white p-1 text-sm">{(["list", "diagram"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 capitalize ${view === v ? "bg-[#205b43] font-medium text-white" : "text-[#526059] hover:bg-[#f0f4f1]"}`}>{v}</button>)}</div>;
  if (view === "diagram") return <>{toggle}<SchemaDiagram schema={schema} /></>;
  return <>{toggle}<div className="mt-4 grid overflow-hidden rounded-2xl border border-[#dfe4df] bg-white shadow-sm lg:grid-cols-[300px_1fr]"><aside className="max-h-[70vh] overflow-y-auto border-b border-[#dfe4df] bg-[#fafcf9] p-4 lg:border-r lg:border-b-0"><p className="mb-3 text-xs font-semibold tracking-[.12em] text-[#718078]">TABLE EXPLORER</p><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tables or fields…" className="mb-4 w-full rounded-lg border border-[#cfd7d1] bg-white px-3 py-2 text-sm outline-none focus:border-[#205b43]" />{matches.map((t) => <button key={t.name} onClick={() => setTable(t.name)} className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${table === t.name ? "bg-[#e3f1e8] font-semibold text-[#205b43] shadow-sm" : "text-[#526059] hover:bg-white"}`}><span className="mr-2 text-[#8b948e]">▦</span>{t.name}</button>)}</aside><section className="min-w-0 p-5 sm:p-7"><div className="flex items-end justify-between border-b border-[#e8ece8] pb-5"><div><p className="text-xs font-semibold tracking-[.12em] text-[#27704f]">SELECTED TABLE</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">{table}</h2></div><span className="rounded-full bg-[#f0f4f1] px-3 py-1 text-xs font-medium text-[#526059]">{columns.length} columns</span></div><div className="mt-5 overflow-hidden rounded-xl border border-[#dfe4df]"><table className="w-full text-left text-sm"><thead className="bg-[#f7f9f7] text-xs uppercase tracking-wide text-[#718078]"><tr><th className="px-4 py-3 font-medium">Field</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Rules</th></tr></thead><tbody>{columns.map((c) => <tr key={c.name} className="border-t border-[#edf0ed]"><td className="px-4 py-3 font-medium text-[#17211c]">{c.name}</td><td className="px-4 py-3 font-mono text-xs text-[#526059]">{c.type}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${c.nullable ? "bg-[#f0f4f1] text-[#66716b]" : "bg-[#e8f4ec] text-[#27704f]"}`}>{c.nullable ? "Nullable" : "Required"}</span></td></tr>)}</tbody></table></div><div className="mt-7"><div className="flex items-center justify-between"><h3 className="font-semibold">Relationships</h3><div className="flex items-center gap-3"><span className="text-sm text-[#66716b]">{relations.length} linked</span>{relations.length > 0 && <button onClick={() => setShowRelated(!showRelated)} className="rounded-lg border border-[#cfd7d1] px-3 py-1.5 text-xs font-medium text-[#205b43] hover:bg-[#f0f4f1]">{showRelated ? "Hide diagram" : "View as diagram"}</button>}</div></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{relations.map((r) => <div key={`${r.fromTable}.${r.fromColumn}`} className="min-w-0 rounded-xl border border-[#dfe4df] bg-[#fbfcfa] p-3 text-sm break-all"><b>{r.fromTable}.{r.fromColumn}</b><span className="mx-2 text-[#27704f]">→</span><b>{r.toTable}.{r.toColumn}</b></div>)}{!relations.length && <p className="text-sm text-[#66716b]">No foreign keys are defined for this table.</p>}</div>{showRelated && relations.length > 0 && <SchemaDiagram schema={relatedSchema} />}</div></section></div></>;
}
