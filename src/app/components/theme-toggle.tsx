"use client";
import { useEffect, useRef } from "react";
type Theme = "light" | "dark" | "system";
const apply = (value: Theme) => { const dark = value === "dark" || (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.classList.toggle("dark", dark); };
export function ThemeToggle() {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { const value = (localStorage.getItem("talksql.theme") as Theme) || "system"; if (ref.current) ref.current.value = value; apply(value); }, []);
  return <select ref={ref} aria-label="Theme" defaultValue="system" onChange={e => { const value = e.target.value as Theme; localStorage.setItem("talksql.theme", value); apply(value); }} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-xs text-[var(--ink-muted)]"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>;
}
