import { SchemaExplorer } from "../../components/schema-explorer";

export default async function SchemaPage({ searchParams }: { searchParams: Promise<{ connection?: string }> }) {
  const { connection } = await searchParams;
  return <SchemaExplorer key={connection ?? "none"} connectionId={connection} />;
}
