import { KNOBS, type KnobKey, type Order } from "@/lib/order";

/** 注文の控え。読むだけの注文票 */
export function OrderRecap({ order, date }: { order: Order; date?: string }) {
  const subject = order.subject === "その他" ? (order.subjectOther?.trim() || "おまかせ") : order.subject;
  return (
    <div className="slip">
      <div className="slip-title"><h2>注文の控え</h2>{date && <span>{date}</span>}</div>
      <div className="field"><label>品名</label><div className="hand">{order.title}</div></div>
      <div className="field"><label>主語</label><div className="hand">{subject}</div></div>
      {order.material?.trim() && (
        <div className="field"><label>素材</label><div className="hand" style={{ fontSize: 16, whiteSpace: "pre-wrap" }}>{order.material}</div></div>
      )}
      {(Object.keys(KNOBS) as KnobKey[]).map((k) => (
        <div className="field" key={k}><label>{KNOBS[k].label}</label><div className="hand">{order.knobs[k]}</div></div>
      ))}
    </div>
  );
}
