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
  for (let i = 1; i <= r.stock; i++) push(2, `${i}/${r.stock}`);
  push(3);
  push(4);
  push(5);
  push(6);
  for (let i = 1; i <= r.review; i++) push(7, `${i}/${r.review}`, `点検のあとに「# 第${i}稿」として本文全体を出してください。`);
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
