# 文筆屋さん ｜ アプリ

Next.js（App Router）。`core/recipe.md` と `core/checks.md` をそのままシステムプロンプトにする。
`core/` は `../core` の写しで、`npm run build` / `npm run dev` のたびに同期される（Vercel ではこの写しだけが見える）。

## 手元で動かす

```
npm install
cp .env.example .env.local   # 鍵を入れる。無ければ MOCK=1
npm run dev
```

## Vercel に載せる

1. Vercel で「Add New → Project」、この GitHub リポジトリを選ぶ。
2. **Root Directory** を `bunpitsuya/app` にする（ここが一番大事）。
3. Environment Variables に `ANTHROPIC_API_KEY` を入れる。`BUNPITSUYA_MODEL` は任意。
   画面だけ確かめたいときは `MOCK=1` を入れると鍵なしで動く。
4. Deploy。Framework は Next.js として自動で認識される。
5. ドメインは Settings → Domains で `bunpitsuya.com` を足し、Cloudflare 側で案内された CNAME を切る。

工程は **1リクエスト＝1工程**（Vercel の関数の上限に収めるため）。画面側が前の工程の全文を控えとして次の
リクエストに渡すので、サーバーは状態を持たない。1工程は長くても数分で終わる。

## 入口と控え（ログインと履歴）

**台帳（`DATABASE_URL`）が無いときは、今まで通りログインも控えも無しで動く。** 入れると次が有効になる。

- **入口** `/login`：メールに合鍵（30分で閉まるリンク）を送り、開くと入れる。合言葉は署名つきの cookie（60日）。
  はじめての人には**お試しの券を3枚**渡す。
- **控え** `/history`：自分が仕立てたものの一覧（日付・品名・字数・券・検索回数）。
  `/history/[id]` を開くと、仕立てた日と同じ姿（注文の控え → 仕立て台の付箋 → 清書）で読み返せる。
- **券**：台帳があるときは券は台帳が数える。注文の最初の工程で引く。足りなければ 402 で断る。
- 控えは工程が終わるたびに書き足すので、途中で止まってもそこまでは残る（一覧に「仕立て中で止まっています」と出る）。

メールの送り口（`RESEND_API_KEY` と `MAIL_FROM`）をまだ用意していない間は、`SHOW_KEY_ON_SCREEN=1` で
合鍵のリンクを画面に出せる。**誰でも他人のメールで入れてしまうので、試用のあいだだけ。**

### 台帳の用意

Vercel なら Storage → Create Database（Postgres）で `POSTGRES_URL` が自動で入る。
帳面（テーブル）は最初のアクセスで勝手に作られるので、移行の手順は要らない。

## 検索（仕入れ先）

- 「手持ちだけ」= 検索しない。「国内で」= 日本の資料を優先して検索。「国内外で」= 制限なし。
- Anthropic のサーバー側ウェブ検索（`web_search_20260209`）を使う。検索は **工程2 仕入れ** と **工程7 の裏取り** だけ。
- 1周あたりの上限: 軽く3回／ふつう5回／念入りに8回（裏取りは最大3回）。料金は 1,000回で $10（1回およそ1.5円）。
- 検索した語は 🔍 の付箋として仕立て台に貼られ、清書の帯に回数が出る。

## 中身

- `src/lib/brand.ts` ── 店の名前。商標の結論が出たらここだけ変える。
- `src/lib/order.ts` ── 注文票の型・つまみ・券の枚数。
- `src/lib/stages.ts` ── 注文票から工程の列を作る（手間で仕入れ・見直しの周回数が変わる）。
- `src/lib/recipe.ts` ── core/*.md を読んでシステムプロンプトを組む。
- `src/app/api/tailor/route.ts` ── 1工程ぶんを Claude に投げ、SSE で付箋（段落）単位に流す。
- `src/lib/useTailor.ts` ── 画面側で工程を順に回す。
- `src/components/` ── 注文票（OrderSlip）／仕立て台（Desk）／清書（Book）。
- `scripts/sync-core.mjs` ── `../core` → `core` の同期。

- `src/lib/db.ts` ── 台帳（Postgres）。帳面の用意もここ。
- `src/lib/auth.ts` ── 合鍵と合言葉（cookie）。
- `src/lib/works.ts` ── 仕立ての控えの出し入れ。

まだ無いもの: Stripe（券の追加）、書き手の台帳、お直し。
