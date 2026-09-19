export type Subject = "私" | "わたし" | "僕" | "ぼく" | "俺" | "その他" | "おまかせ";

export const KNOBS = {
  source: { label: "仕入れ先", options: [
    { v: "手持ちだけ", note: "調べない。原価が安い" },
    { v: "国内で", note: "日本語の一次資料を優先して調べる" },
    { v: "国内外で", note: "海外の資料も調べる。遅く、少し高い" },
  ]},
  effort: { label: "手間", options: [
    { v: "軽く", note: "仕入れ1周・見直し1回" },
    { v: "ふつう", note: "3周・2回" },
    { v: "念入りに", note: "5周・3回", badge: "券2枚" },
  ]},
  thesis: { label: "論旨", options: [
    { v: "指示をふくらませる" },
    { v: "引っかかりを起点に" },
  ]},
  tone: { label: "トーン", options: [
    { v: "親しみやすく品よく" },
    { v: "腹ごたえのある語り" },
    { v: "フランクに" },
  ]},
  form: { label: "仕立て", options: [
    { v: "論として" }, { v: "随筆として" }, { v: "文書そのもの" }, { v: "おまかせ" },
  ]},
  rough: { label: "崩し", options: [
    { v: "崩さない" }, { v: "少し" }, { v: "大きく", note: "遅く・迷いが多く残る" },
  ]},
  length: { label: "分量", options: [
    { v: "ふつう", note: "3000〜5000字" },
    { v: "たっぷり", note: "5000〜8000字" },
  ]},
  consult: { label: "相談", options: [
    { v: "要所で聞く" }, { v: "おまかせ" },
  ]},
} as const;

export type KnobKey = keyof typeof KNOBS;
export type Knobs = { [K in KnobKey]: (typeof KNOBS)[K]["options"][number]["v"] };

export const DEFAULT_KNOBS: Knobs = {
  source: "手持ちだけ",
  effort: "ふつう",
  thesis: "指示をふくらませる",
  tone: "親しみやすく品よく",
  form: "随筆として",
  rough: "少し",
  length: "ふつう",
  consult: "おまかせ",
};

export type Order = {
  title: string;          // 品名（お題）
  subject: Subject;       // 主語
  subjectOther?: string;  // その他のとき
  material?: string;      // 素材（下敷きにする自分の文章）
  knobs: Knobs;
};

/** 券の枚数は手間だけで決まる */
export function ticketCost(o: Pick<Order, "knobs">): number {
  return o.knobs.effort === "念入りに" ? 2 : 1;
}

/** 仕入れ先 → 1周あたりの検索の上限（0 = 検索しない） */
export function searchUses(source: Knobs["source"], effort: Knobs["effort"]): number {
  if (source === "手持ちだけ") return 0;
  return effort === "軽く" ? 3 : effort === "念入りに" ? 8 : 5;
}

/** 手間 → 仕入れの周回数・見直しの回数 */
export function rounds(effort: Knobs["effort"]): { stock: number; review: number } {
  if (effort === "軽く") return { stock: 1, review: 1 };
  if (effort === "念入りに") return { stock: 5, review: 3 };
  return { stock: 3, review: 2 };
}

/** 注文票をそのまま文章にしたもの。最初のユーザーメッセージになる */
export function orderToText(o: Order): string {
  const subject = o.subject === "その他" ? (o.subjectOther?.trim() || "おまかせ") : o.subject;
  const lines = [
    "# 注文票",
    `- 品名：${o.title.trim()}`,
    `- 主語：${subject}`,
    ...(Object.keys(KNOBS) as KnobKey[]).map((k) => `- ${KNOBS[k].label}：${o.knobs[k]}`),
  ];
  if (o.material?.trim()) {
    lines.push("", "## 素材（下敷きにする客の文章）", "", o.material.trim());
  }
  return lines.join("\n");
}
