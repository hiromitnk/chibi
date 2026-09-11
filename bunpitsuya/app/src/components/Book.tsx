"use client";
import { useState } from "react";
import type { Final } from "@/lib/useTailor";

export function Book({ final }: { final: Final }) {
  const [hand, setHand] = useState(false);
  const plain = [final.title, "", ...final.body.flatMap((p) => [p, ""])].join("\n").trim();
  const md = [`# ${final.title}`, "", ...final.body.flatMap((p) => [p, ""])].join("\n").trim();
  const copy = (t: string) => navigator.clipboard?.writeText(t);
  return (
    <section>
      <p className="eyebrow">3 ｜ 清書</p>
      <div className="pad-bar">
        <span className="t">仕上がり ／ {final.chars.toLocaleString()}字 ／ 券 {final.tickets}枚</span>
        <div className="acts">
          <button onClick={() => setHand(!hand)}>{hand ? "明朝で見る" : "手書きで見る"}</button>
          <button onClick={() => copy(plain)}>本文をコピー</button>
          <button onClick={() => copy(md)}>Markdown</button>
        </div>
      </div>
      <div className="pad">
        <div className="pad-top" />
        <div className={"page" + (hand ? " hand-mode" : "")}>
          <h1>{final.title}</h1>
          {final.body.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </div>
      <div className="fold"><span>途中の付箋（1〜8）は上の仕立て台に残してあります。</span></div>
    </section>
  );
}
