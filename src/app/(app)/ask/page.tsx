import { AskData } from "../../components/ask-data";

export default async function AskPage({ searchParams }: { searchParams: Promise<{ connection?: string; q?: string; run?: string }> }) {
  const { connection, q, run } = await searchParams;
  return (
    <div className="pt-10 text-center">
      <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">What would you like to understand?</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--ink-muted)]">Ask a question, inspect the generated SQL, and save useful results as dashboard widgets.</p>
      <AskData key={`${connection ?? "none"}:${q ?? ""}:${run ?? ""}`} connectionId={connection} initialQuestion={q} autoRun={run === "1"} />
    </div>
  );
}
