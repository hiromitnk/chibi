"use client";
import { useCallback, useRef, useState } from "react";
import type { Order } from "./order";
import type { TailorEvent } from "./events";

export type Note = { text: string; partial?: boolean };
export type StackState = { id: string; no: number; label: string; notes: Note[]; done: boolean };
export type Final = { title: string; body: string[]; chars: number; tickets: number };

/** 工程ごとに1リクエスト。前の工程の全文を控えとして次に渡す（サーバーは状態を持たない） */
export function useTailor() {
  const [stacks, setStacks] = useState<StackState[]>([]);
  const [final, setFinal] = useState<Final | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const apply = (e: TailorEvent) => {
    setStacks((prev) => {
      const next = prev.map((s) => ({ ...s, notes: s.notes.map((n) => ({ ...n })) }));
      const find = (id: string) => next.find((s) => s.id === id);
      switch (e.type) {
        case "stage-start":
          if (!find(e.id)) next.push({ id: e.id, no: e.no, label: e.label, notes: [], done: false });
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
          s.done = true; s.notes = s.notes.filter((n) => n.text).map((n) => ({ text: n.text }));
          break;
        }
      }
      return next;
    });
    if (e.type === "done") setFinal({ title: e.title, body: e.body, chars: e.chars, tickets: e.tickets });
    if (e.type === "error") setError(e.message);
  };

  const runStage = async (order: Order, index: number, transcript: string[], signal: AbortSignal) => {
    const res = await fetch("/api/tailor", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order, index, transcript }), signal,
    });
    if (!res.ok || !res.body) throw new Error((await res.text()) || `HTTP ${res.status}`);
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    let text = ""; let last = true; let failed: string | null = null;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const chunks = buf.split("\n\n"); buf = chunks.pop() ?? "";
      for (const c of chunks) {
        const line = c.split("\n").find((l) => l.startsWith("data: ")); if (!line) continue;
        const e = JSON.parse(line.slice(6)) as TailorEvent;
        apply(e);
        if (e.type === "stage-end") { text = e.text; last = e.last; }
        if (e.type === "error") failed = e.message;
      }
    }
    if (failed) throw new Error(failed);
    return { text, last };
  };

  const start = useCallback(async (order: Order) => {
    abort.current?.abort();
    const ac = new AbortController(); abort.current = ac;
    setStacks([]); setFinal(null); setError(null); setBusy(true);
    try {
      const transcript: string[] = [];
      for (let i = 0; i < 64; i++) {
        const { text, last } = await runStage(order, i, transcript, ac.signal);
        transcript.push(text);
        if (last) break;
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }, []);

  return { stacks, final, error, busy, start };
}
