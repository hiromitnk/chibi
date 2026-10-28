import type { ReactNode } from "react";

/** 付箋・清書に出す最小限の整形: **太字**、行頭の # は見出し扱い、それ以外はそのまま */
export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = text.split("\n");
  lines.forEach((line, li) => {
    const m = line.match(/^#{1,3}\s+(.*)$/);
    const body = m ? m[1] : line;
    const parts = body.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    const nodes = parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? <span key={i} className="k">{p.slice(2, -2)}</span> : p
    );
    if (m) out.push(<span key={`h${li}`} className="k">{nodes}</span>);
    else out.push(...nodes.map((n, i) => (typeof n === "string" ? <span key={`t${li}-${i}`}>{n}</span> : n)));
    if (li < lines.length - 1) out.push("\n");
  });
  return out;
}
