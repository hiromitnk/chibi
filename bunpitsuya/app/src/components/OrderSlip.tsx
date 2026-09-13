"use client";
import { useState } from "react";
import { BRAND } from "@/lib/brand";
import { KNOBS, DEFAULT_KNOBS, ticketCost, type Order, type Knobs, type KnobKey, type Subject } from "@/lib/order";

const SUBJECTS: { v: Subject; note?: string }[] = [
  { v: "私" }, { v: "わたし" }, { v: "僕" }, { v: "ぼく" }, { v: "俺" },
  { v: "その他", note: "使いたい主語を記入" }, { v: "おまかせ", note: "お題から店が決める" },
];

export function OrderSlip({ tickets, busy, onOrder }: { tickets: number; busy: boolean; onOrder: (o: Order) => void }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<Subject>("私");
  const [subjectOther, setSubjectOther] = useState("");
  const [material, setMaterial] = useState("");
  const [knobs, setKnobs] = useState<Knobs>(DEFAULT_KNOBS);
  const cost = ticketCost({ knobs });
  const can = title.trim().length > 0 && !busy && tickets >= cost;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section>
      <p className="eyebrow">1 ｜ 注文票</p>
      <div className="board">
        <span className="rivet tl" /><span className="rivet tr" /><span className="rivet bl" /><span className="rivet br" />
        <div className="clip"><b>{BRAND.slipMark}</b><small>ORDER SLIP</small></div>
        <div className="ruler" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ top: 40 * (i + 1) }}>{i + 1}</i>)}
        </div>
        <div className="slip">
          <div className="slip-title"><h2>ご注文</h2><span>{today}</span></div>

          <div className="field">
            <label>品名</label>
            <textarea className="hand" rows={2} placeholder="お題を書く" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>主語</label>
            <div>
              <div className="opts" role="radiogroup">
                {SUBJECTS.map((s) => (
                  <span key={s.v} role="radio" aria-checked={subject === s.v} tabIndex={0} className={"opt" + (subject === s.v ? " on" : "")}
                    onClick={() => setSubject(s.v)} onKeyDown={(e) => e.key === "Enter" && setSubject(s.v)}>
                    {s.v}{s.note && <small>{s.note}</small>}
                  </span>
                ))}
              </div>
              {subject === "その他" && (
                <input className="hand" style={{ marginTop: 4, minWidth: "14em" }} placeholder="主語を記入" value={subjectOther} onChange={(e) => setSubjectOther(e.target.value)} />
              )}
            </div>
          </div>
          <div className="field">
            <label>素材</label>
            <textarea className="hand" rows={2} placeholder="下敷きにする自分の文章があれば、ここに貼る（任意）" value={material} onChange={(e) => setMaterial(e.target.value)} />
          </div>

          {(Object.keys(KNOBS) as KnobKey[]).map((k) => (
            <div className="field" key={k}>
              <label>{KNOBS[k].label}</label>
              <div className="opts" role="radiogroup">
                {KNOBS[k].options.map((o) => {
                  const on = knobs[k] === o.v;
                  const badge = "badge" in o ? (o as { badge: string }).badge : undefined;
                  const note = "note" in o ? (o as { note: string }).note : undefined;
                  return (
                    <span key={o.v} role="radio" aria-checked={on} tabIndex={0} className={"opt" + (on ? " on" : "")}
                      onClick={() => setKnobs({ ...knobs, [k]: o.v })} onKeyDown={(e) => e.key === "Enter" && setKnobs({ ...knobs, [k]: o.v })}>
                      {o.v}{note && <small>{note}</small>}{badge && <span className="badge">{badge}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="slip-foot">
            <div className="cost">この注文で使う券 ── <strong>{cost}枚</strong>（残り {tickets}枚 → {Math.max(0, tickets - cost)}枚）</div>
            <button className="btn" disabled={!can} onClick={() => onOrder({ title, subject, subjectOther, material, knobs })}>
              {busy ? "仕立て中…" : "仕立てる"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
