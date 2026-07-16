import type { Metadata } from "next";

import { WorkspaceOverview } from "../components/workspace-overview";

export const metadata: Metadata = {
  title: "Overview — TalkSQL",
  description: "Connect databases, ask questions, verify SQL, and build live dashboards.",
};

export default function OverviewPage() {
  return <WorkspaceOverview />;
}
