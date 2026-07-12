"use client";

import { useState, type ReactNode } from "react";

function Overlay({ children, onClose, labelledBy }: { children: ReactNode; onClose: () => void; labelledBy: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#17211c]/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel = "Delete", onConfirm, onClose }: { title: string; body?: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Overlay onClose={onClose} labelledBy="confirm-title">
      <h2 id="confirm-title" className="text-lg font-semibold tracking-tight">{title}</h2>
      {body && <p className="mt-2 text-sm leading-6 text-[#66716b]">{body}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-[#66716b] hover:bg-[#f0f2ef]">Cancel</button>
        <button onClick={() => { onConfirm(); onClose(); }} className="rounded-lg bg-[#a63d2f] px-4 py-2 text-sm font-medium text-white hover:bg-[#8c3222]">{confirmLabel}</button>
      </div>
    </Overlay>
  );
}

export function PromptDialog({ title, defaultValue = "", placeholder, submitLabel = "Save", onSubmit, onClose }: { title: string; defaultValue?: string; placeholder?: string; submitLabel?: string; onSubmit: (value: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(defaultValue);
  const submit = () => { if (value.trim()) { onSubmit(value.trim()); onClose(); } };
  return (
    <Overlay onClose={onClose} labelledBy="prompt-title">
      <h2 id="prompt-title" className="text-lg font-semibold tracking-tight">{title}</h2>
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder={placeholder} className="mt-4 w-full rounded-lg border border-[#cfd7d1] bg-[#fbfcfa] px-3 py-2 text-sm outline-none focus:border-[#205b43]" />
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-[#66716b] hover:bg-[#f0f2ef]">Cancel</button>
        <button onClick={submit} disabled={!value.trim()} className="rounded-lg bg-[#205b43] px-4 py-2 text-sm font-medium text-white hover:bg-[#174532] disabled:opacity-60">{submitLabel}</button>
      </div>
    </Overlay>
  );
}
