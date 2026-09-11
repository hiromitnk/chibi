# 文筆屋さん ｜ アプリ

Next.js（App Router）。`../core/recipe.md` と `../core/checks.md` をそのままシステムプロンプトにする。

```
npm install
cp .env.example .env.local   # 鍵を入れる。無ければ MOCK=1
npm run dev
```

- `src/lib/brand.ts` ── 店の名前。商標の結論が出たらここだけ変える。
- `src/lib/order.ts` ── 注文票の型・つまみ・券の枚数。
- `src/lib/stages.ts` ── 注文票から工程の列を作る（手間で仕入れ・見直しの周回数が変わる）。
- `src/lib/recipe.ts` ── core/*.md を読んでシステムプロンプトを組む。
- `src/app/api/tailor/route.ts` ── 工程ごとに1リクエスト。SSEで付箋（段落）単位に流す。
- `src/components/` ── 注文票（OrderSlip）／仕立て台（Desk）／清書（Book）。

まだ無いもの: ログイン、券の残りの永続化、Stripe、台帳、お直し、履歴。
