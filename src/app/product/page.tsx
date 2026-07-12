import Link from "next/link";

import { Logo } from "../components/logo";
import { ThemeToggle } from "../components/theme-toggle";

const FEATURES = [
  {
    number: "01",
    title: "Connect your databases",
    body: "Connect PostgreSQL or MySQL with encrypted credentials. Each connection belongs to the active workspace, so teams stay separated by design.",
  },
  {
    number: "02",
    title: "Understand the schema",
    body: "Browse tables and columns, search fields, and see verified foreign-key relationships before you start asking questions.",
  },
  {
    number: "03",
    title: "Ask in plain language",
    body: "Turn a question into a transparent, read-only query. See the SQL, execution status, result count, and timing every time.",
  },
  {
    number: "04",
    title: "Use a real SQL workspace",
    body: "Write your own SELECT queries with line numbers, schema-aware table and column suggestions, keyboard shortcuts, and CSV export.",
  },
  {
    number: "05",
    title: "Build live dashboards",
    body: "Save query results as table, metric, chart, or schema widgets. A widget re-runs its saved safe query when it refreshes.",
  },
  {
    number: "06",
    title: "Keep control of your data",
    body: "Queries run in read-only transactions with timeouts and row limits. Connection secrets are encrypted; the only rows stored are results you explicitly save as widgets.",
  },
];

const SECURITY = [
  { title: "Encrypted credentials", body: "Database passwords are encrypted with AES-256-GCM before storage and never sent to the browser. Updating a connection requires re-verifying credentials live." },
  { title: "Read-only at the database", body: "Every query runs inside a READ ONLY transaction with a statement timeout and row cap — enforced by your database engine, not just by prompt rules." },
  { title: "Workspace isolation", body: "Connections, widgets, and logs are scoped to your workspace on every API call. No cross-organization access paths exist." },
  { title: "Full transparency", body: "The exact SQL is shown with every answer before you trust it. Nothing runs that you can't inspect." },
  { title: "Complete audit trail", body: "Every question, the generated SQL, its outcome, and timing are logged — including refused and failed queries." },
  { title: "Polite to your database", body: "Concurrent queries per database are capped, dashboards render from cached snapshots, and refreshes are throttled — your production database barely notices TalkSQL." },
];

export default function ProductPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label="TalkSQL home">
          <Logo size={36} />
          <span className="text-lg font-semibold tracking-tight">TalkSQL</span>
        </Link>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <Link href="/auth" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:border-[var(--brand)] hover:text-[var(--brand)]">Sign in</Link>
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 sm:px-8 sm:pt-24">
        <div className="absolute -right-32 top-0 -z-10 h-96 w-96 rounded-full bg-[var(--brand-soft)] blur-3xl" />
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">YOUR DATA, IN CONVERSATION</p>
        <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[1.03] tracking-[-0.055em] sm:text-7xl">The fastest path from database to a decision.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--ink-muted)]">TalkSQL gives your team a safe, transparent workspace to explore databases, ask questions in plain language, write SQL, and keep live answers on a shared dashboard.</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/auth" className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--brand)]/20 hover:bg-[var(--brand-strong)]">Create your workspace →</Link>
          <a href="#how-it-works" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">See how it works</a>
        </div>

        <div className="mt-16 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.14)] sm:p-5">
          <div className="rounded-2xl bg-[#17211c] p-5 text-white sm:p-8">
            <div className="flex items-center justify-between gap-4 text-xs text-white/60"><span className="font-medium text-white/90">Ask data</span><span>postgresql · product analytics</span></div>
            <p className="mt-8 text-2xl font-medium tracking-tight sm:text-3xl">“Which products have the highest repeat purchase rate?”</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
              <pre className="overflow-x-auto rounded-xl bg-white/10 p-4 text-xs leading-6 text-emerald-100"><code>{"SELECT product_name,\n       ROUND(repeat_rate * 100, 1) AS repeat_rate\nFROM product_retention\nORDER BY repeat_rate DESC\nLIMIT 5;"}</code></pre>
              <div className="light-island rounded-xl bg-white p-4 text-[#17211c]"><p className="text-xs font-semibold tracking-[.12em] text-[#27704f]">RESULT</p><p className="mt-3 text-3xl font-semibold tracking-tight">38.4%</p><p className="mt-1 text-sm text-[#66716b]">Top repeat purchase rate</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e6f1eb]"><div className="h-full w-[76%] rounded-full bg-[#27704f]" /></div></div>
            </div>
            <p className="mt-5 text-xs text-white/55">Read-only query · 42ms · SQL shown before it runs</p>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-[var(--border)] bg-[var(--surface-2)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 sm:px-8 md:grid-cols-[0.8fr_1.2fr] md:py-24">
          <div><p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">ONE WORKSPACE, THREE MOVES</p><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">From connection to a dashboard your team can trust.</h2></div>
          <ol className="space-y-7">
            <li className="flex gap-5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-sm font-semibold text-[var(--brand)]">1</span><div><h3 className="font-semibold">Connect once</h3><p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">Add a database to the workspace and test it before anything is saved.</p></div></li>
            <li className="flex gap-5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-sm font-semibold text-[var(--brand)]">2</span><div><h3 className="font-semibold">Explore with context</h3><p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">Use the schema map, question flow, or SQL editor—each knows which connection is active.</p></div></li>
            <li className="flex gap-5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-sm font-semibold text-[var(--brand)]">3</span><div><h3 className="font-semibold">Save what matters</h3><p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">Pin a result to the dashboard and refresh it later without regenerating or editing the original query.</p></div></li>
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 sm:px-8 sm:py-28">
        <div className="max-w-2xl"><p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">WHAT’S IN THE PRODUCT</p><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Everything required to make database answers useful—not just impressive.</h2></div>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => <article key={feature.number} className="bg-[var(--surface)] p-6 sm:p-7"><p className="text-xs font-semibold tracking-[.14em] text-[var(--accent)]">{feature.number}</p><h3 className="mt-7 text-lg font-semibold tracking-tight">{feature.title}</h3><p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">{feature.body}</p></article>)}
        </div>
      </section>

      <section id="security" className="border-y border-[var(--border)] bg-[var(--surface-2)]">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:px-8 sm:py-28">
          <div className="max-w-2xl"><p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">BUILT FOR TRUST</p><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Secure by architecture, not by promise.</h2><p className="mt-4 text-sm leading-6 text-[var(--ink-muted)]">TalkSQL connects to production databases, so safety is enforced at the lowest layer available — the database itself — and everything above it stays inspectable.</p></div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY.map((item) => (
              <article key={item.title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand)]">✓</span>
                  <h3 className="font-semibold tracking-tight">{item.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 sm:px-8 sm:py-28">
        <div className="rounded-3xl bg-[var(--brand)] px-7 py-12 text-white sm:px-12 sm:py-16"><p className="text-xs font-semibold tracking-[0.18em] text-emerald-100">READY WHEN YOUR DATA IS</p><h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">Give everyone a clearer way to work with the database.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-emerald-50">Create a workspace, connect your first database, and start with a schema that makes sense.</p><Link href="/auth" className="mt-8 inline-block rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[var(--brand)] hover:bg-emerald-50">Get started →</Link></div>
      </section>
    </main>
  );
}
