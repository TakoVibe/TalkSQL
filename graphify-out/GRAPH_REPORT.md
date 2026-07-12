# Graph Report - .  (2026-07-12)

## Corpus Check
- Corpus is ~1,435 words - fits in a single context window. You may not need a graph.

## Summary
- 65 nodes · 56 edges · 14 communities (5 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]
- [[_COMMUNITY_TalkSQL Application|TalkSQL Application]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `scripts` - 5 edges
3. `starterConnections` - 2 edges
4. `paths` - 2 edges
5. `eslintConfig` - 1 edges
6. `nextConfig` - 1 edges
7. `private` - 1 edges
8. `dev` - 1 edges
9. `build` - 1 edges
10. `lint` - 1 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Version Guidance` --rationale_for--> `Route Handlers`  [INFERRED]
  AGENTS.md → node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md

## Import Cycles
- None detected.

## Communities (14 total, 9 thin omitted)

### Community 0 - "TalkSQL Application"
Cohesion: 0.13
Nodes (15): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+7 more)

### Community 1 - "TalkSQL Application"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, lint, start, version

### Community 2 - "TalkSQL Application"
Cohesion: 0.22
Nodes (9): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+1 more)

### Community 3 - "TalkSQL Application"
Cohesion: 0.29
Nodes (7): dependencies, mysql2, next, pg, react, react-dom, zod

### Community 4 - "TalkSQL Application"
Cohesion: 0.33
Nodes (4): suggestions, ConnectionSummary, DatabaseEngine, starterConnections

## Knowledge Gaps
- **48 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+43 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `compilerOptions` connect `TalkSQL Application` to `TalkSQL Application`, `TalkSQL Application`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `TalkSQL Application` to `TalkSQL Application`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `dependencies` connect `TalkSQL Application` to `TalkSQL Application`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _49 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `TalkSQL Application` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._