/** サーバー → 画面 のイベント。SSE の data: に JSON で流す */
export type TailorEvent =
  | { type: "stage-start"; id: string; no: number; label: string }
  | { type: "note"; id: string; text: string }        // 段落が一つ閉じた
  | { type: "partial"; id: string; text: string }     // 書きかけの段落（上書き）
  | { type: "stage-end"; id: string }
  | { type: "done"; title: string; body: string[]; chars: number; tickets: number }
  | { type: "error"; message: string };
