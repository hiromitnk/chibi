"use client";
import { useState } from "react";
import { STAGE_NAMES } from "@/lib/stages";
import type { StackState } from "@/lib/useTailor";

function Stack({ s, sel, onSel }: { s: StackState; sel: string | null; onSel: (k: string, t: string) => void }) {
  const [open, setOpen] = useState(false);
  const long = s.done && s.notes.length > 2;
  return (
    <div className={`stack s${s.no}${long ? " long" : ""}${open ? " open" : ""}`} onClick={long ? () => setOpen(!open) : undefined}>
      {s.notes.length === 0 && <div className="note"><h4>{s.label}</h4><p><span className="caret" /></p></div>}
      {s.notes.map((n, i) => {
        const key = `${s.id}:${i}`;
        return (
          <div key={key} className={"note" + (n.partial ? " partial" : "") + (n.search ? " search" : "") + (sel === key ? " sel" : "")}
            onClick={(e) => { if (long && !open) return; e.stopPropagation(); onSel(key, n.text); }}>
            {i === 0 && <h4>{s.label}{!s.done ? "　仕立て中" : ""}</h4>}
            <p>{n.text}{n.partial && <span className="caret" />}</p>
          </div>
        );
      })}
      {long && <div className="hint" />}
    </div>
  );
}

export function Desk({ stacks }: { stacks: StackState[] }) {
  const [sel, setSel] = useState<{ key: string; text: string } | null>(null);
  const current = stacks.find((s) => !s.done)?.no ?? (stacks.length ? 9 : 0);
  const doneNos = new Set(stacks.filter((s) => s.done).map((s) => s.no));
  // 同じ工程（仕入れ 1/3 など）は一列にまとめて見せる
  const byNo = new Map<number, StackState>();
  for (const s of stacks) {
    const e = byNo.get(s.no);
    if (!e) byNo.set(s.no, { ...s, notes: [...s.notes] });
    else { e.notes.push(...s.notes); e.done = s.done; e.label = s.label; }
  }

  return (
    <section>
      <p className="eyebrow">2 ｜ 仕立て台</p>
      <p className="strip">
        {STAGE_NAMES.map((n, i) => {
          const no = i + 1;
          const cls = doneNos.has(no) && current > no ? "done" : current === no ? "now" : "";
          return (<span key={no}><span className={cls}>{no} {n}</span>{no < 8 && <i>&gt;</i>}</span>);
        })}
      </p>
      <div className="desk">
        {stacks.length === 0 ? <p className="empty">注文票を出すと、ここに付箋が貼られていきます。</p> : (
          <div className="notes">
            {STAGE_NAMES.map((n, i) => {
              const no = i + 1; const s = byNo.get(no);
              if (!s) return <div key={no} className="stack todo"><div className="note"><h4>{no} ｜ {n}</h4></div></div>;
              return <Stack key={no} s={s} sel={sel?.key ?? null} onSel={(key, text) => setSel(sel?.key === key ? null : { key, text })} />;
            })}
          </div>
        )}
        {sel && <div className="reading"><h5>付箋の原文</h5>{sel.text}</div>}
      </div>
    </section>
  );
}
