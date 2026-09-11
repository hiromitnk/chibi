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

## 中身

- `src/lib/brand.ts` ── 店の名前。商標の結論が出たらここだけ変える。
- `src/lib/order.ts` ── 注文票の型・つまみ・券の枚数。
- `src/lib/stages.ts` ── 注文票から工程の列を作る（手間で仕入れ・見直しの周回数が変わる）。
- `src/lib/recipe.ts` ── core/*.md を読んでシステムプロンプトを組む。
- `src/app/api/tailor/route.ts` ── 1工程ぶんを Claude に投げ、SSE で付箋（段落）単位に流す。
- `src/lib/useTailor.ts` ── 画面側で工程を順に回す。
- `src/components/` ── 注文票（OrderSlip）／仕立て台（Desk）／清書（Book）。
- `scripts/sync-core.mjs` ── `../core` → `core` の同期。

まだ無いもの: ログイン、券の残りの永続化、Stripe、台帳、お直し、履歴。
