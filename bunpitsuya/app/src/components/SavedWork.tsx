"use client";
import { Desk } from "@/components/Desk";
import { Book } from "@/components/Book";
import type { StackState } from "@/lib/useTailor";
import type { SavedFinal, SavedStage } from "@/lib/works";

/** 台帳に残した控えを、仕立てた日と同じ姿で開く */
export function SavedWork({ stages, final, tickets, searches }: {
  stages: SavedStage[]; final: SavedFinal | null; tickets: number; searches: number;
}) {
  const stacks: StackState[] = stages.map((s) => ({
    id: s.id, no: s.no, label: s.label, done: true,
    notes: s.notes.map((t) => ({ text: t, search: t.startsWith("🔍") })),
  }));
  const copyAll = () => navigator.clipboard?.writeText(stages.map((s) => `# ${s.label}\n\n${s.text}`).join("\n\n---\n\n"));

  return (
    <>
      <Desk stacks={stacks} />
      <p style={{ margin: "-40px 0 48px" }}>
        <button className="pad-bar-btn" onClick={copyAll}
          style={{ fontFamily: "var(--mono)", fontSize: 11.5, background: "rgba(255,255,255,.35)", border: "1px solid #8c6f34", color: "#5a4416", padding: "5px 11px", borderRadius: 2, cursor: "pointer" }}>
          付箋を全コピー
        </button>
      </p>
      {final && <Book final={{ ...final, tickets, searches }} />}
    </>
  );
}
