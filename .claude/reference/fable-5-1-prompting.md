# Claude Fable 5.1 — 自前ハーネス向けリファレンス

Claude Code / Agent SDK / Managed Agents を使っているだけなら、ここは読まなくていい（履歴の扱いはツール側が守ってくれる）。
**自分で `messages` 配列を組んで API を叩いている場合だけ**関係する。

日常運用のルール（指示文の本体）はリポジトリ直下の `CLAUDE.md`。

---

## 破壊的変更 3つ

### 1. 強制ツール呼び出しが 400

`tool_choice: {"type": "any"}` と `{"type": "tool", "name": "..."}` は Fable 5.1 で 400。
`count_tokens` と Batches でも同じ。

代替：

- `{"type": "auto"}` ＋ user ターンでツール名を明示した指示
- 引数のスキーマを守らせたいだけなら、ツール定義に `strict: true`
- JSON が欲しかっただけなら構造化出力（`output_config.format`）

`{"type": "none"}` は影響なし。`disable_parallel_tool_use` は `auto` と併用可。

診断：`grep -rn tool_choice .`

### 2. thinking ブロックはモデルに紐づく

Fable 5.1 が作った thinking ブロックは、他のモデルが読めない（Mythos 5.1 だけ例外）。
逆（旧モデル → 5.1）は読める。片方向。モデル切り替えルーターを組んでいるなら要注意。

ドロップは課金前に起きるので `usage.input_tokens` が下がる。剥がす必要はない。

### 3. 履歴の編集で 400（preserved thinking）

thinking ブロックより前にあるもの（system、tools、過去のメッセージ）を1文字でも変えると、
次のリクエストが 400（`The block is bound to a different conversation`）。

2026-08-31 以降に作られたアカウントは強制。それ以前は `prefix_mismatch_behavior` を明示したときだけ。
将来のモデルで全アカウントに広がる予定なので、今から追記型（append-only）にしておく。

**確認手順**：`thinking.block_binding.prefix_mismatch_behavior` を `drop_block` にして1セッション回し、
レスポンスの `input_transformations` に何か出るかを見る。出たら編集している。

踏みやすいパターンと代替：

| やっていること | 代替 |
|---|---|
| 今回だけのリマインダーを最後の user メッセージに差し込んで次で消す | `role: "system"` ＋ `clear_at: "next_user_message"`（下記） |
| system や tools を差し替える | 配列を作り直さず、会話途中の system メッセージとして差し込む |
| 古いターンを要約で置き換える（keep-tail / 非同期 compaction） | サーバー側 compaction か context editing。自前なら「要約1本＋新しい user ターン」に置き換えて thinking を1つも持ち越さない |

---

## 新機能 3つ（すべて beta ヘッダー必要）

### 1. 会話途中の effort 変更（キャッシュを切らない）

beta: `mid-conversation-output-config-2026-07-01`
対象: Claude Fable 5.1 / Mythos 5.1 / Opus 5（Claude API）

```http
POST /v1/messages
anthropic-beta: mid-conversation-output-config-2026-07-01

{"model": "claude-fable-5-1", "max_tokens": 4096,
 "output_config": {"effort": "high"},
 "messages": [
   {"role": "user", "content": "Plan the migration."},
   {"role": "assistant", "content": "Here's the plan: ..."},
   {"role": "system", "content": [], "output_config": {"effort": "low"}},
   {"role": "user", "content": "Now rename the config file."}
 ]}
```

- 次の user ターンから効き、次の system メッセージまで持続。
- effort だけのメッセージ（`content: []`）は配置ルールの例外で、どこに置いてもいい。
- 下げるのは確実に効く。上げるのは大きめのジャンプ（`low` → `xhigh`）のほうが効く。
- トップレベルの値を毎リクエスト変えるより、こちらを使う。トップレベル変更はキャッシュを捨てるうえ、
  モデルが前の水準の自分の回答に引きずられて効きが鈍い。

### 2. 1ターン限定の system メッセージ

beta: `mid-conversation-system-clear-at-2026-08-21`

```http
{"role": "system", "clear_at": "next_user_message",
 "content": "Results have landed in your inbox; check it before running more code."}
```

- 次の user メッセージが来たら自動で効力が消える。**配列からは消さない**（消すと編集扱い）。
- 消えたあとは入力トークンにも数えられない。
- text のみ。`output_config` や `cache_control` は載せられない。直後に user メッセージが続くと 400。
  ツール結果は1つの user メッセージにまとめ、リマインダーはその後ろに置く。
- beta なしなら、同じ user メッセージの `tool_result` の後ろに text ブロックとして足し、過去のコピーは残す。

### 3. ツール呼び出し間の進捗メモを受け取る

beta: `thinking-display-updates-2026-08-18` ＋ `thinking: {"type": "adaptive", "display": "updates"}`

既定の `display: "omitted"` だと進捗メモは空で返る。「黙っている」のではなく「届いていない」。
`updates` にすると、reasoning は隠したまま進捗メモだけテキストで届く。

- 非空テキストの thinking ブロック＝進捗メモ。空なら何も描画しない。0個のこともある。
- ストリーミングでは `tool_use` ブロックの直前に `thinking_delta` として流れてくる。
- 課金は要約ではなく実際の長さ（`usage.output_tokens`）。

前提として、旧モデル向けの「結果は最後にまとめて報告せよ」「途中で喋るな」の類が system プロンプトに残っていたら**先に消す**。

---

## 並列ツール呼び出しのナッジ

長いエージェントループで「次に読むものが暗黙」のとき、1ターン1コールに落ちることがある。
結果は同じで往復とトークンが増えるだけ。

**先に測る**：ツール呼び出しが2個以上ある assistant ターンの割合をログに出す。低くなければ足さない。

置き場所が文面より効く。ツール結果を返すたびに、その user メッセージの後ろに
1ターン限定 system メッセージとして**毎回新しいコピーを追記**し、古いコピーは1バイトも触らずに残す。

> First privately list what you need next; then request every item that doesn't depend on another's result in this one response.

`privately` は消さないこと。無いとユーザーではなくリマインダーに返事をすることがある。

**短いタスクに足すと遅くなる**（「まず頭の中で列挙する」を律儀に守って思考ブロックが立つため）。長いループ限定。

## ツール出力が隠れる UI なら伝える

> Only you see that command's output - the user's terminal shows at most a few lines of it. If the user needs to read any of it, put it in your reply.

## xhigh / max で長い成果物を頼むとき

思考の中で下書き → 本文を書き直す二重書きが起きる。基本は `high` に落とす。
どうしても上げるなら `max_tokens` を思考＋本文の両方に足りる値にして、user メッセージの末尾にこれを足す
（`[max_tokens]` は実際の値に置換。過去のコピーは送った値のまま残す）：

> Everything Claude produces in one reply, including any reasoning or drafting it does before the reply, counts toward a single limit of about [max_tokens] tokens. If that limit is reached before the reply is finished, the person receives a cut-off response and has to start over. Composing an entire output or deliverable in full as reasoning and then again as a reply would double the length of the turn without improving the result, so Claude doesn't do that.
>
> Instead, when the person has asked for a long or effort-intensive deliverable such as a multi-section document, a large table or dataset, or a complete code file, Claude spends extra effort on understanding the request, checking the inputs Claude's answer depends on, settling the structure and other difficult decisions, and otherwise using the reasoning space to reason and the output space to write an output. If Claude plans well then it should not need to draft its output multiple times (and Claude is pretty good at planning, so this should not be an issue).

## クライアント側で圧縮するなら

> Summarize the transcript inside <summary></summary> tags. Include relevant information in the summary such that this conversation will be continued by a new context window without needing to redo work or be reprovided with relevant constraints or context. Be sure to preserve: (1) any difficulties or problems that came up, and how they were handled or resolved; (2) any possibilities, options, or approaches that were raised, tried, or set aside, and why; (3) anything that was asked for, decided, agreed, ruled out, or established as a preference, constraint, or boundary - stated exactly; (4) exactly where things stand now - what has been covered, settled, or completed so far; (5) anything still open, unresolved, promised, or expected to happen next; (6) specific details that would be hard to reconstruct - names, numbers, dates, exact wording, links or references - kept exactly. Be complete on these even at the cost of length; keep everything else concise. Weight the two voices differently: keep what the user said, asked for, shared, or established carefully and close to their own words; your own explanations and reasoning can be condensed much further, to what they concluded or produced - as long as nothing in the six items above is dropped. Do not call any tools while writing this summary; respond with text only.

最後の一文は効いている。無いと要約の代わりにツールを呼ぶことがある。

---

## 料金（1M トークンあたり）

| | Fable 5 | Fable 5.1 |
|---|---|---|
| 入力 | $10.00 | $10.00 |
| 出力 | $50.00 | $50.00 |
| キャッシュ読み取り | $1.00 | **$0.25** |
| キャッシュ書き込み（5分 / 1時間） | $12.50 / $20 | $12.50 / $20 |
| バッチ（入力 / 出力） | $5 / $25 | $5 / $25 |

キャッシュ読み取りだけが 1/4。他モデルは入力の 0.1 倍だが、5.1 は 0.025 倍。

含意：**コスト目的で早めに履歴を圧縮するのは、5.1 では最適でなくなった可能性がある**（公式）。
圧縮のタイミングを遅らせて測る。逆に、ミスがヒットに比べて相対的に高くつくので、キャッシュを温かく保つ価値は上がった。
5〜60分のアイドルには、1時間 TTL より `max_tokens: 0` の keep-alive 再送のほうが安いことが多い。

## その他

- コンテキスト 1M（既定かつ最大）、最大出力 128K。
- 思考は常時オン。`thinking` の `{"type": "disabled"}` も `budget_tokens` も 400。深さは `output_config.effort` で制御。
- effort は `low` / `medium` / `high` / `xhigh` / `max`。既定 `high`。
  **Fable 5 で測った結果は使い回さない**（同じ名前でも思考量がモデルごとに違う）。
- 生の思考内容は返らない。`display` は `omitted`（既定）/ `summarized` / `updates`。
- assistant prefill は 400。サンプリングパラメータ（`temperature` など）も 400。
- 拒否は HTTP 200 ＋ `stop_reason: "refusal"`。`content` を読む前に必ず `stop_reason` を見る。
  出力前の拒否は課金されない。カテゴリは `cyber` / `bio` / `reasoning_extraction` など。
- 誤検知を減らす言い回し：「コンパイルできますか？」ではなく「バグはありますか？」／
  マイナー言語はドキュメントを渡す／ツール出力の base64 は返さない。
- Priority Tier 非対応。ZDR（ゼロデータ保持）では利用不可（Anthropic の明示的許可がある場合を除く）。
- 移行は Claude Code で `/claude-api migrate this project to claude-fable-5-1`。
