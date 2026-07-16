"use client";

import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";

type Schema = { tables: { name: string }[]; columns: { table: string; name: string }[] };

export function SqlEditor({ value, onChange, schema, onRun, onSave, height = "520px" }: { value: string; onChange: (value: string) => void; schema?: Schema; onRun: (selection?: string) => void; onSave?: () => void; height?: string | number }) {
  const disposable = useRef<ReturnType<Monaco["languages"]["registerCompletionItemProvider"]> | undefined>(undefined);
  const onRunRef = useRef(onRun);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onRunRef.current = onRun; }, [onRun]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  const mount: OnMount = (editor, monaco) => {
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
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      const selection = editor.getSelection();
      const selectedSql = selection && !selection.isEmpty() ? editor.getModel()?.getValueInRange(selection).trim() : undefined;
      onRunRef.current(selectedSql || undefined);
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current?.());
  };
  return <Editor key={`${schema?.tables.length ?? 0}:${schema?.columns.length ?? 0}`} height={height} language="sql" theme="vs-dark" value={value} onChange={(next) => onChange(next ?? "")} onMount={mount} options={{ minimap: { enabled: true, maxColumn: 80, showSlider: "mouseover" }, fontSize: 14, lineNumbers: "on", wordWrap: "on", automaticLayout: true, scrollBeyondLastLine: false, tabSize: 2, insertSpaces: true, bracketPairColorization: { enabled: true }, renderWhitespace: "selection", smoothScrolling: true, padding: { top: 16, bottom: 16 } }} />;
}
