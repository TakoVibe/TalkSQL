import { ConnectionCards } from "../components/connection-cards";

export default function DatabasePage() {
  return (
    <>
      <p className="mb-5 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">Your connected databases. Schema and relationships are read directly from each database — no customer rows are stored.</p>
      <ConnectionCards />
    </>
  );
}
