"use client";

import { useState } from "react";

export type ResultRows = { columns: string[]; rows: Record<string, unknown>[]; truncated?: boolean };
export type ChartType = "bar" | "line" | "area" | "pie";
export type ChartPointSelection = { index: number; label: string; value: number };

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
/** Validated categorical palette (dataviz reference, light mode) — order is the CVD-safety mechanism, don't reshuffle. */
const CAT = ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"];
const MAX_PIE_SLICES = 7;

export function formatLabel(value: unknown): string {
  const s = String(value ?? "");
  if (/^\d{4}-\d{2}$/.test(s)) return new Date(`${s}-01T00:00:00`).toLocaleDateString("en", { month: "short", year: "numeric" });
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10) + "T00:00:00");
    return d.toLocaleDateString("en", { month: "short", day: "numeric", ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "2-digit" }) });
  }
  return s;
}

function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return value.toLocaleString();
  return formatLabel(value);
}

export function downloadCsv(result: ResultRows, filename: string) {
  const escape = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
  const csv = [result.columns.join(","), ...result.rows.map((row) => result.columns.map((c) => escape(row[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function MetricTile({ title, result }: { title: string; result: ResultRows }) {
  const column = result.columns[0];
  const value = result.rows[0]?.[column];
  return (
    <div className="rounded-xl border border-[#dfe4df] bg-white p-5">
      <p className="text-xs font-medium text-[#66716b]">{title}</p>
      <p className="mt-2 text-4xl font-semibold tracking-tight text-[#17211c]" style={{ fontVariantNumeric: "tabular-nums" }}>{typeof value === "number" ? value.toLocaleString() : String(value ?? "—")}</p>
      <p className="mt-1 text-xs text-[#8b948e]">{column}</p>
    </div>
  );
}

function PieChart({ data, onPointSelect }: { data: { label: string; value: number }[]; onPointSelect?: (point: ChartPointSelection) => void }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const positive = data.filter((d) => d.value > 0);
  const top = positive.slice(0, MAX_PIE_SLICES);
  const rest = positive.slice(MAX_PIE_SLICES).reduce((sum, d) => sum + d.value, 0);
  const slices = rest > 0 ? [...top, { label: "Other", value: rest }] : top;
  const total = slices.reduce((sum, d) => sum + d.value, 0);
  if (!total) return <p className="p-4 text-sm text-[#66716b]">No positive values to chart.</p>;
  const cx = 110, cy = 110, r1 = 55, r2 = 100;
  const offsets = slices.reduce<number[]>((list, s) => [...list, (list[list.length - 1] ?? 0) + s.value], []);
  const arcs = slices.map((slice, i) => {
    const a0 = -Math.PI / 2 + ((offsets[i] - slice.value) / total) * Math.PI * 2;
    const sweep = Math.min((slice.value / total) * Math.PI * 2, Math.PI * 2 - 0.0001);
    const a1 = a0 + sweep;
    const point = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    const large = sweep > Math.PI ? 1 : 0;
    const mid = (a0 + a1) / 2, share = slice.value / total;
    return { slice, i, share, mid, path: `M ${point(r2, a0)} A ${r2} ${r2} 0 ${large} 1 ${point(r2, a1)} L ${point(r1, a1)} A ${r1} ${r1} 0 ${large} 0 ${point(r1, a0)} Z` };
  });
  const active = activeIndex == null ? undefined : arcs[activeIndex];
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 220 220" className="h-52 w-52 shrink-0 overflow-visible" role="img" aria-label="Interactive share of total chart" onPointerLeave={() => setActiveIndex(null)}>
        {arcs.map(({ slice, i, path, share, mid }) => <g key={i}>
          <path
            d={path}
            fill={CAT[i % CAT.length]}
            stroke="#fff"
            strokeWidth={activeIndex === i ? 4 : 2}
            opacity={activeIndex == null || activeIndex === i ? 1 : 0.42}
            tabIndex={0}
            role="img"
            aria-label={`${formatLabel(slice.label)}: ${slice.value.toLocaleString()}, ${(share * 100).toFixed(1)} percent`}
            className="cursor-pointer outline-none transition-[opacity,filter,stroke-width] duration-200 focus-visible:brightness-110"
            onPointerEnter={() => setActiveIndex(i)}
            onFocus={() => setActiveIndex(i)}
            onBlur={() => setActiveIndex(null)}
            onClick={() => { setActiveIndex(activeIndex === i ? null : i); onPointSelect?.({ index: i, label: slice.label, value: slice.value }); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPointSelect?.({ index: i, label: slice.label, value: slice.value }); } }}
          />
          {share >= 0.08 && <text pointerEvents="none" x={cx + (r1 + r2) / 2 * Math.cos(mid)} y={cy + (r1 + r2) / 2 * Math.sin(mid)} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="600" fill="#fff">{Math.round(share * 100)}%</text>}
        </g>)}
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize="18" fontWeight="700" fill="currentColor">{active ? `${(active.share * 100).toFixed(1)}%` : COMPACT.format(total)}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fill="#66716b">{active ? COMPACT.format(active.slice.value) : "total"}</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {arcs.map(({ slice, i, share }) => <li key={i}>
          <button type="button" onPointerEnter={() => setActiveIndex(i)} onPointerLeave={() => setActiveIndex(null)} onFocus={() => setActiveIndex(i)} onBlur={() => setActiveIndex(null)} onClick={() => { setActiveIndex(activeIndex === i ? null : i); onPointSelect?.({ index: i, label: slice.label, value: slice.value }); }} className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${activeIndex === i ? "bg-[var(--brand-soft)]" : "hover:bg-[var(--surface-2)]"}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CAT[i % CAT.length] }} />
            <span className="truncate text-[#17211c]">{formatLabel(slice.label)}</span>
            <span className="ml-auto shrink-0 text-[#66716b]" style={{ fontVariantNumeric: "tabular-nums" }}>{slice.value.toLocaleString()} · {(share * 100).toFixed(1)}%</span>
          </button>
        </li>)}
      </ul>
      <p className="sr-only" aria-live="polite">{active ? `${formatLabel(active.slice.label)}: ${active.slice.value.toLocaleString()}, ${(active.share * 100).toFixed(1)} percent` : ""}</p>
    </div>
  );
}

export function ResultChart({ result, x, y, type, onPointSelect }: { result: ResultRows; x: string; y: string; type: ChartType; onPointSelect?: (point: ChartPointSelection) => void }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const data = result.rows.map((row) => ({ label: String(row[x] ?? ""), value: Number(row[y]) })).filter((d) => Number.isFinite(d.value));
  if (!data.length) return <p className="p-4 text-sm text-[#66716b]">No numeric data to chart.</p>;
  if (type === "pie") return <PieChart data={data} onPointSelect={onPointSelect} />;
  const W = 640, H = 240, M = { top: 12, right: 12, bottom: 30, left: 46 };
  const max = Math.max(...data.map((d) => d.value), 0), min = Math.min(...data.map((d) => d.value), 0);
  const span = max - min || 1;
  const plotW = W - M.left - M.right, plotH = H - M.top - M.bottom;
  const yPos = (v: number) => M.top + plotH - ((v - min) / span) * plotH;
  const step = plotW / data.length;
  const labelEvery = Math.ceil(data.length / 8);
  const ticks = [0, 1, 2, 3, 4].map((i) => min + (span * i) / 4);
  const linePoints = data.map((d, i) => `${M.left + (i + 0.5) * step},${yPos(d.value)}`).join(" ");
  const active = activeIndex == null ? undefined : data[activeIndex];
  const activeX = activeIndex == null ? 0 : M.left + (activeIndex + 0.5) * step;
  const activeY = active ? yPos(active.value) : 0;
  return (
    <div className="relative" onPointerLeave={() => setActiveIndex(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`Interactive ${type} chart of ${y} by ${x}`}>
        {ticks.map((t) => <g key={t}><line x1={M.left} x2={W - M.right} y1={yPos(t)} y2={yPos(t)} stroke="#edf0ed" /><text x={M.left - 6} y={yPos(t) + 3} textAnchor="end" fontSize="10" fill="#8b948e">{COMPACT.format(t)}</text></g>)}
        <line x1={M.left} x2={W - M.right} y1={yPos(Math.max(min, 0))} y2={yPos(Math.max(min, 0))} stroke="#cfd7d1" />
        {active && <line x1={activeX} x2={activeX} y1={M.top} y2={H - M.bottom} stroke="#8fbca5" strokeWidth="1" strokeDasharray="4 4" pointerEvents="none" />}
        {type === "bar" && data.map((d, i) => {
          const top = yPos(Math.max(d.value, 0)), height = Math.max(Math.abs(yPos(d.value) - yPos(Math.max(min, 0))), 1);
          return <rect key={i} x={M.left + i * step + 2} y={top} width={Math.max(step - 4, 1)} height={height} rx="3" fill={activeIndex === i ? "var(--brand-strong)" : "var(--accent)"} opacity={activeIndex == null || activeIndex === i ? 1 : 0.4} tabIndex={0} role="img" aria-label={`${formatLabel(d.label)}: ${d.value.toLocaleString()}`} className="cursor-pointer outline-none transition-[opacity,fill] duration-200 focus-visible:stroke-[3] focus-visible:stroke-[#8fd4ae]" onPointerEnter={() => setActiveIndex(i)} onFocus={() => setActiveIndex(i)} onBlur={() => setActiveIndex(null)} onClick={() => { setActiveIndex(activeIndex === i ? null : i); onPointSelect?.({ index: i, label: d.label, value: d.value }); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPointSelect?.({ index: i, label: d.label, value: d.value }); } }} />;
        })}
        {type === "area" && <polygon points={`${M.left + 0.5 * step},${yPos(Math.max(min, 0))} ${linePoints} ${M.left + (data.length - 0.5) * step},${yPos(Math.max(min, 0))}`} fill="#27704f" opacity="0.15" pointerEvents="none" />}
        {(type === "line" || type === "area") && <>
          <polyline points={linePoints} fill="none" stroke="#27704f" strokeWidth="2" strokeLinejoin="round" pointerEvents="none" />
          {data.map((d, i) => <g key={i}>
            <circle cx={M.left + (i + 0.5) * step} cy={yPos(d.value)} r={activeIndex === i ? 6 : 3.5} fill={activeIndex === i ? "var(--brand-strong)" : "var(--accent)"} stroke="#fff" strokeWidth="2" pointerEvents="none" className="transition-[r,fill] duration-200" />
            <circle cx={M.left + (i + 0.5) * step} cy={yPos(d.value)} r="12" fill="transparent" tabIndex={0} role="img" aria-label={`${formatLabel(d.label)}: ${d.value.toLocaleString()}`} className="cursor-pointer outline-none focus-visible:stroke-2 focus-visible:stroke-[#8fd4ae]" onPointerEnter={() => setActiveIndex(i)} onFocus={() => setActiveIndex(i)} onBlur={() => setActiveIndex(null)} onClick={() => { setActiveIndex(activeIndex === i ? null : i); onPointSelect?.({ index: i, label: d.label, value: d.value }); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPointSelect?.({ index: i, label: d.label, value: d.value }); } }} />
          </g>)}
        </>}
        {data.map((d, i) => i % labelEvery === 0 ? <text key={i} x={M.left + (i + 0.5) * step} y={H - 10} textAnchor="middle" fontSize="10" fill="#66716b">{(() => { const l = formatLabel(d.label); return l.length > 12 ? `${l.slice(0, 11)}…` : l; })()}</text> : null)}
      </svg>
      {active && <div role="status" className="pointer-events-none absolute z-10 min-w-32 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg border border-[var(--border)] bg-[var(--foreground)] px-3 py-2 text-xs text-[var(--background)] shadow-lg" style={{ left: `${(activeX / W) * 100}%`, top: `${(activeY / H) * 100}%` }}>
        <p className="max-w-48 truncate font-medium opacity-75">{formatLabel(active.label)}</p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums">{active.value.toLocaleString()}</p>
      </div>}
      <p className="sr-only" aria-live="polite">{active ? `${formatLabel(active.label)}: ${active.value.toLocaleString()}` : ""}</p>
    </div>
  );
}

export function ResultTable({ result, maxRows, onRowSelect }: { result: ResultRows; maxRows?: number; onRowSelect?: (row: Record<string, unknown>) => void }) {
  const rows = maxRows ? result.rows.slice(0, maxRows) : result.rows;
  const numeric = result.columns.map((c) => result.rows.some((row) => typeof row[c] === "number"));
  return (
    <div className="overflow-x-auto rounded-lg border border-[#dfe4df]">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#f7f9f7] text-xs text-[#718078]"><tr>{result.columns.map((c, i) => <th key={c} className={`px-4 py-2.5 font-medium ${numeric[i] ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} tabIndex={onRowSelect ? 0 : undefined} onClick={() => onRowSelect?.(row)} onKeyDown={(event) => { if (onRowSelect && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRowSelect(row); } }} className={`border-t border-[#edf0ed] outline-none transition-colors hover:bg-[var(--brand-soft)] focus-visible:bg-[var(--brand-soft)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] ${onRowSelect ? "cursor-pointer" : ""}`}>{result.columns.map((c, j) => <td key={c} className={`max-w-64 truncate px-4 py-2.5 ${numeric[j] ? "text-right" : ""}`} style={numeric[j] ? { fontVariantNumeric: "tabular-nums" } : undefined}>{formatCell(row[c])}</td>)}</tr>)}</tbody>
      </table>
      {maxRows && result.rows.length > maxRows && <p className="border-t border-[#edf0ed] px-4 py-2 text-xs text-[#8b948e]">Showing {maxRows} of {result.rows.length}{result.truncated ? "+" : ""} rows</p>}
    </div>
  );
}
