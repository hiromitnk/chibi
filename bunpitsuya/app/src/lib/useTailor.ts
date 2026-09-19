"use client";
import { useCallback, useRef, useState } from "react";
import type { Order } from "./order";
import type { TailorEvent } from "./events";

export type Note = { text: string; partial?: boolean; search?: boolean };
export type StackState = { id: string; no: number; label: string; notes: Note[]; done: boolean };
export type Final = { title: string; body: string[]; chars: number; tickets: number; searches: number };

/** 工程ごとに1リクエスト。前の工程の全文を控えとして次に渡す（サーバーは状態を持たない） */
export function useTailor() {
  const [stacks, setStacks] = useState<StackState[]>([]);
  const [final, setFinal] = useState<Final | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const searchesRef = useRef(0);
  const abort = useRef<AbortController | null>(null);

  const apply = (e: TailorEvent) => {
    setStacks((prev) => {
      const next = prev.map((s) => ({ ...s, notes: s.notes.map((n) => ({ ...n })) }));
      const find = (id: string) => next.find((s) => s.id === id);
      switch (e.type) {
        case "stage-start": {
          const s = find(e.id);
          if (!s) next.push({ id: e.id, no: e.no, label: e.label, notes: [], done: false });
          else { s.notes = []; s.done = false; }
          break;
        }
        case "partial": {
          const s = find(e.id); if (!s) break;
          const last = s.notes[s.notes.length - 1];
          if (last?.partial) last.text = e.text; else s.notes.push({ text: e.text, partial: true });
          break;
        }
        case "search": {
          const s = find(e.id); if (!s) break;
          // 書きかけの付箋の前に、🔍の付箋を差し込む
          const partialIdx = s.notes.findIndex((n) => n.partial);
          const note = { text: "🔍 " + e.query, search: true };
          if (partialIdx >= 0) s.notes.splice(partialIdx, 0, note); else s.notes.push(note);
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
          s.done = true; s.notes = s.notes.filter((n) => n.text).map((n) => ({ text: n.text, search: n.search }));
          break;
        }
      }
      return next;
    });
    if (e.type === "stage-end") searchesRef.current += e.searches;
    if (e.type === "done") setFinal({ title: e.title, body: e.body, chars: e.chars, tickets: e.tickets, searches: searchesRef.current });
    if (e.type === "error") setError(e.message);
  };

  const runStage = async (order: Order, index: number, transcript: string[], signal: AbortSignal) => {
    const res = await fetch("/api/tailor", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order, index, transcript }), signal,
    });
    if (!res.ok || !res.body) throw new Error((await res.text()) || `HTTP ${res.status}`);
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    let text = ""; let last = false; let ended = false; let failed: string | null = null; let label = "";
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const chunks = buf.split("\n\n"); buf = chunks.pop() ?? "";
      for (const c of chunks) {
        const line = c.split("\n").find((l) => l.startsWith("data: ")); if (!line) continue;
        const e = JSON.parse(line.slice(6)) as TailorEvent;
        apply(e);
        if (e.type === "stage-start") label = e.label;
        if (e.type === "stage-end") { text = e.text; last = e.last; ended = true; }
        if (e.type === "error") failed = e.message;
      }
    }
    if (failed) throw new Error(failed);
    // 工程の終わりが来ないまま通信が閉じた = サーバー側で切れた（時間切れなど）。黙って止めない
    if (!ended) throw new Error(`「${label || "工程 " + (index + 1)}」の途中で通信が切れました`);
    return { text, last };
  };

  const start = useCallback(async (order: Order) => {
    abort.current?.abort();
    const ac = new AbortController(); abort.current = ac;
    setStacks([]); setFinal(null); setError(null); setBusy(true); searchesRef.current = 0;
    try {
      const transcript: string[] = [];
      for (let i = 0; i < 64; i++) {
        let res: { text: string; last: boolean };
        try {
          res = await runStage(order, i, transcript, ac.signal);
        } catch (err) {
          // 通信が切れた工程は一度だけやり直す。その工程の付箋は貼り直す
          if ((err as Error).name === "AbortError" || !/通信が切れました|文章が返りませんでした/.test((err as Error).message)) throw err;
          setStacks((prev) => prev.filter((s) => s.done));
          res = await runStage(order, i, transcript, ac.signal);
        }
        transcript.push(res.text);
        if (res.last) break;
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }, []);

  return { stacks, final, error, busy, start };
}
