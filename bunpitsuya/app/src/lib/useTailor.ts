"use client";
import { useCallback, useRef, useState } from "react";
import type { Order } from "./order";
import type { TailorEvent } from "./events";

export type Note = { text: string; partial?: boolean };
export type StackState = { id: string; no: number; label: string; notes: Note[]; done: boolean };
export type Final = { title: string; body: string[]; chars: number; tickets: number };

export function useTailor() {
  const [stacks, setStacks] = useState<StackState[]>([]);
  const [final, setFinal] = useState<Final | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const apply = (e: TailorEvent) => {
    setStacks((prev) => {
      const next = prev.map((s) => ({ ...s, notes: [...s.notes] }));
      const find = (id: string) => next.find((s) => s.id === id);
      switch (e.type) {
        case "stage-start":
          next.push({ id: e.id, no: e.no, label: e.label, notes: [], done: false });
          break;
        case "partial": {
          const s = find(e.id); if (!s) break;
          const last = s.notes[s.notes.length - 1];
          if (last?.partial) last.text = e.text; else s.notes.push({ text: e.text, partial: true });
          break;
        }
        case "note": {
          const s = find(e.id); if (!s) break;
          const last = s.notes[s.notes.length - 1];
          if (last?.partial) { last.text = e.text; last.partial = false; } else s.notes.push({ text: e.text });
          break;
        }
        case "stage-end": {
          const s = find(e.id); if (!s) break;
          s.done = true; s.notes = s.notes.filter((n) => !n.partial || n.text);
          s.notes.forEach((n) => (n.partial = false));
          break;
        }
      }
      return next;
    });
    if (e.type === "done") setFinal(e);
    if (e.type === "error") setError(e.message);
  };

  const start = useCallback(async (order: Order) => {
    abort.current?.abort();
    const ac = new AbortController(); abort.current = ac;
    setStacks([]); setFinal(null); setError(null); setBusy(true);
    try {
      const res = await fetch("/api/tailor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order), signal: ac.signal });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const chunks = buf.split("\n\n"); buf = chunks.pop() ?? "";
        for (const c of chunks) { const line = c.split("\n").find((l) => l.startsWith("data: ")); if (line) apply(JSON.parse(line.slice(6))); }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }, []);

  return { stacks, final, error, busy, start };
}
