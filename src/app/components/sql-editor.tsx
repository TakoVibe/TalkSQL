"use client";

import Editor, { type Monaco } from "@monaco-editor/react";
import { useRef } from "react";

type Schema = { tables: { name: string }[]; columns: { table: string; name: string }[] };

export function SqlEditor({ value, onChange, schema, onRun }: { value: string; onChange: (value: string) => void; schema?: Schema; onRun: () => void }) {
  const disposable = useRef<ReturnType<Monaco["languages"]["registerCompletionItemProvider"]> | undefined>(undefined);
  function mount(editor: { addCommand: (key: number, callback: () => void) => void }, monaco: Monaco) {
    disposable.current?.dispose();
    const suggestions = ["SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "LIMIT", "JOIN", "LEFT JOIN", "COUNT(*)"].map((label) => ({ label, kind: monaco.languages.CompletionItemKind.Keyword, insertText: label }));
    schema?.tables.forEach((table) => suggestions.push({ label: table.name, kind: monaco.languages.CompletionItemKind.Class, insertText: table.name }));
    schema?.columns.forEach((column) => suggestions.push({ label: `${column.table}.${column.name}`, kind: monaco.languages.CompletionItemKind.Field, insertText: `${column.table}.${column.name}` }));
    disposable.current = monaco.languages.registerCompletionItemProvider("sql", { provideCompletionItems: (model: { getValue: () => string }) => {
      const aliases = [...model.getValue().matchAll(/\b(?:from|join)\s+([\w.]+)\s+(?:as\s+)?(\w+)/gi)];
      for (const match of aliases) {
        const tableName = match[1].split(".").pop(); const alias = match[2];
        schema?.columns.filter((column) => column.table === tableName).forEach((column) => suggestions.push({ label: `${alias}.${column.name}`, kind: monaco.languages.CompletionItemKind.Field, insertText: `${alias}.${column.name}` }));
      }
      return { suggestions };
    } });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRun);
  }
  return <Editor key={`${schema?.tables.length ?? 0}:${schema?.columns.length ?? 0}`} height="380px" language="sql" theme="vs-dark" value={value} onChange={(next) => onChange(next ?? "")} onMount={mount} options={{ minimap: { enabled: false }, fontSize: 14, lineNumbers: "on", wordWrap: "on", automaticLayout: true, scrollBeyondLastLine: false, tabSize: 2, padding: { top: 16, bottom: 16 } }} />;
}
