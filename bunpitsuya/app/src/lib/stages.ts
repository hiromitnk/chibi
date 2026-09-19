import type { Order } from "./order";
import { rounds } from "./order";

export type Stage = {
  id: string;        // "2-1" など
  no: number;        // 1〜8
  name: string;      // 工程名
  label: string;     // 付箋の見出し「2 ｜ 仕入れ 1/3」
  instruction: string; // その工程で店に渡す指示
};

export const STAGE_NAMES = ["お題を解く", "仕入れ", "芯", "裏紙", "構成", "一筆目", "見直し", "仕上げ"] as const;

/** 注文票から工程の列を作る。仕入れと見直しは手間で周回数が変わる */
export function buildStages(order: Order): Stage[] {
  const r = rounds(order.knobs.effort);
  const s: Stage[] = [];
  const push = (no: number, suffix = "", extra = "") => {
    const name = STAGE_NAMES[no - 1];
    const head = `${no} ｜ ${name}${suffix ? " " + suffix : ""}`;
    s.push({
      id: suffix ? `${no}-${suffix.split("/")[0]}` : String(no),
      no,
      name,
      label: head,
      instruction:
        `次は「# ${head}」の工程だけを書き出してください。他の工程には進まないでください。` +
        (extra ? "\n" + extra : ""),
    });
  };
  push(1);
  const searching = order.knobs.source !== "手持ちだけ";
  const searchNote = searching
    ? "検索が使えます。材料には必ず出典URLを本文中に書いてください（引用の枠ではなく、文として）。" +
      (order.knobs.source === "国内で" ? "日本語の一次資料を優先してください。" : "国内外の資料を使ってください。")
    : "この周は検索を使いません。手持ちの材料だけで進め、出典URLを捏造しないでください。";
  for (let i = 1; i <= r.stock; i++) push(2, `${i}/${r.stock}`, searchNote);
  push(3);
  push(4);
  push(5);
  push(6);
  for (let i = 1; i <= r.review; i++) push(7, `${i}/${r.review}`,
    `点検のあとに「# 第${i}稿」として本文全体を出してください。` +
    (searching ? "裏取りでは、実在の人物・引用・数値に検索で当たり直し、見つからなかった引用は稿から外してください。" : ""));
  push(8, "", [
    "摘発・直し・数え直しのあと、最後に必ず次の形で仕上がりを出してください。",
    "",
    "===仕上がり===",
    "# （題）",
    "（本文。段落は空行で区切る）",
    "===ここまで===",
  ].join("\n"));
  return s;
}
