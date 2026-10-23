# seikyu — 請求書ツール 仕様（実装用の約束ごと）

Misoca の代わり。1人で使う前提。ビルド不要の静的ウェブアプリ（素の HTML / CSS / JS）。
データはブラウザの localStorage、JSON で書き出し／読み込みしてバックアップ。
PDF はブラウザ内で pdf-lib + fontkit + IPAゴシック（`fonts/ipag.ttf`）で生成してダウンロード。

## ファイル構成

```
seikyu/
  index.html        画面（1ページ、ハッシュで画面切り替え）
  styles.css
  js/
    store.js        localStorage の読み書き、採番、バックアップ   window.Store
    calc.js         金額計算（税率ごと集計・源泉徴収）           window.Calc
    recurring.js    定期請求の発行判定と生成                     window.Recurring
    pdf.js          PDF 生成                                    window.InvoicePDF
    app.js          画面とイベント
  vendor/pdf-lib.min.js         (window.PDFLib)
  vendor/fontkit.umd.min.js     (window.fontkit)
  fonts/ipag.ttf
```

ES modules は使わない（file:// で開いても動くように）。各ファイルは IIFE で `window.Xxx` に公開する。
ただし fetch('fonts/ipag.ttf') は file:// では動かないので、README で `npx serve` か `python3 -m http.server` を案内する。

## データモデル（localStorage キー `seikyu:v1` に1つの JSON）

```js
{
  version: 1,
  settings: {
    issuer: {                       // 自分（請求元）
      name: "",                     // 屋号・氏名
      postal: "", address: "",      // 住所は改行可
      tel: "", email: "",
      registrationNumber: "",       // 適格請求書発行事業者登録番号 "T" + 13桁
      bank: "",                     // 振込先（改行可）
      sealDataUrl: ""               // 角印の画像 (PNG/JPEG の dataURL)、空なら無し
    },
    numberFormat: "{YYYY}{MM}-{SEQ3}", // 請求書番号の書式。{YYYY}{MM}{DD}{SEQ}{SEQ3}{SEQ4}
    nextSeq: 1,                     // 次の連番
    defaultTaxRate: 10,             // 10 | 8 | 0
    defaultNotes: "",               // 備考の初期値
    rounding: "floor"               // 消費税の端数処理 floor | round | ceil
  },
  clients: [
    { id, name, honorific: "御中",  // "御中" | "様"
      postal, address, contactName, email, memo }
  ],
  invoices: [
    {
      id,
      number: "202610-001",
      clientId,
      clientSnapshot: { name, honorific, postal, address, contactName }, // 発行時点の宛先
      title: "",                    // 件名
      issueDate: "2026-10-23",      // YYYY-MM-DD
      dueDate:   "2026-11-30",
      items: [ { name, quantity, unit, unitPrice, taxRate } ], // taxRate: 10|8|0
      withholding: false,           // 源泉徴収するか
      notes: "",
      status: "draft",              // draft | issued | paid
      recurringId: null,            // 定期請求から作られたら元の id
      estimate: {                   // 任意。見積書を作ったら保存（内容は請求書と同じ、日付と番号だけ別）
        number: "Q202610-001",      //   初期値 "Q" + 請求書番号
        issueDate: "2026-10-09",    //   見積日。初期値 = 請求日の14日前
        validUntil: "2026-11-08"    //   有効期限。初期値 = 見積日の30日後
      },
      createdAt, updatedAt          // ISO 文字列
    }
  ],
  recurring: [
    {
      id, name: "",                 // 管理用の名前（例: ○○社 月額保守）
      active: true,
      template: { clientId, title, items, withholding, notes },
      intervalMonths: 1,            // 1=毎月, 3=四半期, 12=毎年 など
      issueDay: 25,                 // 発行日（その月の日）。31 等は月末に丸める。0 = 月末
      dueRule: { monthsAfter: 1, day: 0 }, // 支払期限 = 発行月の monthsAfter か月後の day 日（0=月末）
      startDate: "2026-11-01",      // この日以降で最初の発行日から開始
      endDate: "",                  // 空なら無期限
      nextIssueDate: "2026-11-25",  // 次に発行する日（Recurring が管理）
      titleTemplate: "{ym-1}分 保守費用", // 件名の差し込み（下の「差し込み」参照）。品目名・備考にも同じ差し込みが効く
      autoStatus: "draft"           // 生成した請求書の status（draft か issued）
    }
  ]
}
```

id は `crypto.randomUUID()`。

## Calc（js/calc.js）

```js
Calc.lineAmount(item)            // quantity * unitPrice（小数OK、結果は円に Math.round）
Calc.summarize(invoice, rounding) → {
  byRate: [ { rate: 10, base: 100000, tax: 10000 }, { rate: 8, ... }, { rate: 0, ... } ], // 金額のある税率だけ、10→8→0 の順
  subtotal,          // 税抜合計
  taxTotal,          // 消費税合計（税率ごとに端数処理してから合算 = インボイス制度の方式）
  total,             // 税込合計
  withholding,       // 源泉徴収税額（withholding=true のとき）。税抜合計に対して
                     //   100万円以下: 10.21%、超える部分: 20.42%、1円未満切り捨て
  billed             // ご請求金額 = total - withholding
}
Calc.yen(n)  → "¥1,234,567"
```

## Recurring（js/recurring.js）

```js
Recurring.computeFirstIssueDate(rec)       // startDate 以降で最初の発行日
Recurring.runDue(state, today = new Date()) → { state, created: [invoice...] }
  // active な各定期について nextIssueDate <= today の間ループして請求書を作る（取りこぼし分もまとめて作る）
  // 作るたびに Store の採番を使って number を振り、nextIssueDate を intervalMonths 進める
  // endDate を過ぎたら止める
Recurring.preview(rec, count = 6) → [ "2026-11-25", ... ] // 今後の発行予定日
Recurring.fillTemplate(text, issueDate) → string        // 差し込み
Recurring.buildInvoice(state, rec, issueDate) → invoice  // 1件作る（採番を進める。state.invoices には入れない）
Recurring.dueDateFor(rec, issueDate) / nextAfter(rec, date)
```

差し込み（件名・品目名・備考）。基準は「対象月」= 発行日の月:

| 書き方 | 例（発行日 2027-01-25） |
|---|---|
| `{year}` `{year-1}` | 2027 / 2026（年単位でずらす） |
| `{month}` `{month-1}` `{month+1}` | 1 / 12 / 2（月単位でずらす。1月の -1 は 12） |
| `{MM}` `{MM-1}` | 01 / 12 |
| `{ym}` `{ym-1}` `{ym+1}` | 2027年1月 / 2026年12月 / 2027年2月（年も繰り上がる。「前月分」はこれ） |
| `{lastday}` `{lastday-1}` | 31 / 31（その月・前月の末日） |
| `{date}` | 2027年1月25日 |
| 旧形式 `{YYYY}` `{M}` `{MM}` | 2027 / 1 / 01 |

Store（js/store.js）:

```js
Store.load() / Store.save(state)  // state は Store.state にも保持
Store.nextNumber(dateStr, state?) // 番号を振って settings.nextSeq を進める
Store.peekNumber(dateStr, state?) // 進めずに次の番号を見る
Store.formatNumber(fmt, dateStr, seq)
Store.exportJSON(state)           // seikyu-backup-YYYYMMDD.json をダウンロード
Store.importJSON(file) → Promise<state|null>  // confirm してから置き換え
Store.uuid(), Store.today()       // today はローカル日付 "YYYY-MM-DD"
```

アプリを開いたときに `runDue` を呼び、作られた請求書があれば画面上部に「定期請求から N 件作成しました」と出す。

## InvoicePDF（js/pdf.js）

```js
await InvoicePDF.generate(invoice, settings) → Uint8Array   // A4 縦
await InvoicePDF.download(invoice, settings)                 // ファイル名: 請求書_{number}_{宛先名}.pdf
await InvoicePDF.generate(invoice, settings, { docType: 'estimate' }) // 見積書
await InvoicePDF.download(invoice, settings, { docType: 'estimate' })
```

見積書（docType: 'estimate'）: 表題「見積書」、「お見積金額」、有効期限、振込先なし。
番号・日付は invoice.estimate から。画面では請求書の編集画面と一覧の操作メニューに
「見積書を作成（2週間前）」ボタン → 見積日・有効期限・見積番号のダイアログ（編集可）→ 保存してPDF / プレビュー。
保存済みなら初期値はそこから読み、一覧に「見積あり」を表示。

レイアウト（Misoca っぽいオーソドックスな日本の請求書）:
- 右上: 請求日・請求書番号
- 中央上: 大きく「請求書」
- 左: 宛先名 + 敬称（下線）、郵便番号・住所、担当者名
- 右: 請求元（屋号、住所、TEL、メール、登録番号）、角印を右寄せで重ねる
- 「下記のとおりご請求申し上げます。」件名
- ご請求金額（税込）を大きく、お支払期限
- 明細表: 品目 / 数量 / 単位 / 単価 / 金額。8% の行は品目末尾に「※」を付け、表の下に「※は軽減税率対象」
- 明細が多いときは改ページ（2ページ目以降はヘッダ簡略）
- 小計・税率ごと内訳「10%対象 ¥xxx 消費税 ¥xxx」・合計・（源泉徴収税額 ▲¥xxx）・ご請求金額
- お振込先、備考
- フォントは fonts/ipag.ttf を fetch して `subset: true` で埋め込み、一度読んだらキャッシュ
- 色は墨＋アクセント1色（#2f4f4f 程度）で上品に
```
