/** サーバー → 画面 のイベント。SSE の data: に JSON で流す。1リクエスト＝1工程 */
export type TailorEvent =
  | { type: "stage-start"; id: string; no: number; label: string; index: number; total: number }
  | { type: "note"; id: string; text: string }        // 段落が一つ閉じた
  | { type: "partial"; id: string; text: string }     // 書きかけの段落（上書き）
  | { type: "search"; id: string; query: string }   // 検索した（🔍の付箋）
  | { type: "stage-end"; id: string; text: string; last: boolean; searches: number } // その工程の全文（次の工程に渡す）
  | { type: "done"; title: string; body: string[]; chars: number; tickets: number }
  | { type: "error"; message: string };
