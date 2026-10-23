// Node で calc.js / pdf.js を動かしてサンプル PDF を作る
//   node test/pdf-node-test.js   → test/out/*.pdf
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const assert = require('assert');

const root = path.join(__dirname, '..');
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

// ブラウザっぽい window を用意
globalThis.window = globalThis;
window.PDFLib = require(path.join(root, 'vendor/pdf-lib.min.js'));
window.fontkit = require(path.join(root, 'vendor/fontkit.umd.min.js'));
let fontFetches = 0;
globalThis.fetch = async (url) => {
  fontFetches++;
  const buf = fs.readFileSync(path.join(root, url));
  return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
};
for (const f of ['js/calc.js', 'js/pdf.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const { Calc, InvoicePDF } = window;

// ---- Calc のテスト ----
assert.strictEqual(Calc.yen(1234567), '¥1,234,567');
assert.strictEqual(Calc.yen(0), '¥0');
assert.strictEqual(Calc.yen(-500), '-¥500');
assert.strictEqual(Calc.lineAmount({ quantity: 1.5, unitPrice: 333 }), 500); // 499.5 → 500
assert.strictEqual(Calc.lineAmount({ quantity: '3', unitPrice: '1000' }), 3000);

{
  const s = Calc.summarize({ withholding: true, items: [{ quantity: 1, unitPrice: 1500000, taxRate: 10 }] }, 'floor');
  assert.strictEqual(s.subtotal, 1500000);
  assert.strictEqual(s.withholding, 204200); // 102,100 + 102,100
  assert.strictEqual(s.total, 1650000);
  assert.strictEqual(s.billed, 1650000 - 204200);
}
{
  const s = Calc.summarize({ withholding: true, items: [{ quantity: 1, unitPrice: 1000000, taxRate: 10 }] }, 'floor');
  assert.strictEqual(s.withholding, 102100);
  const s2 = Calc.summarize({ withholding: true, items: [{ quantity: 1, unitPrice: 33333, taxRate: 10 }] }, 'floor');
  assert.strictEqual(s2.withholding, 3403); // 3403.29 → 3403
  const s3 = Calc.summarize({ withholding: false, items: [{ quantity: 1, unitPrice: 33333, taxRate: 10 }] }, 'floor');
  assert.strictEqual(s3.withholding, 0);
}
{
  // 税率ごとに端数処理: 10% 1,005 → 100.5 / 8% 1,005 → 80.4
  const inv = { items: [
    { quantity: 1, unitPrice: 1005, taxRate: 8 },
    { quantity: 1, unitPrice: 1005, taxRate: 10 },
    { quantity: 1, unitPrice: 500, taxRate: 0 }
  ] };
  const f = Calc.summarize(inv, 'floor');
  assert.deepStrictEqual(f.byRate, [
    { rate: 10, base: 1005, tax: 100 }, { rate: 8, base: 1005, tax: 80 }, { rate: 0, base: 500, tax: 0 }
  ]);
  assert.strictEqual(f.taxTotal, 180);
  assert.strictEqual(f.total, 2690);
  assert.strictEqual(Calc.summarize(inv, 'round').taxTotal, 181);
  assert.strictEqual(Calc.summarize(inv, 'ceil').taxTotal, 182);
  // 金額のない税率は出さない
  assert.strictEqual(Calc.summarize({ items: [{ quantity: 1, unitPrice: 100, taxRate: 10 }] }).byRate.length, 1);
}
console.log('Calc: ok');

// ---- 角印用の PNG を作る（赤い枠の四角、背景透明） ----
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function sealPng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
      const frame = edge >= 3 && edge < 11;
      // 中に「田」の字っぽい線
      const mid = Math.abs(x - size / 2) < 4 || Math.abs(y - size / 2) < 4;
      const inner = edge >= 22 && edge < 27;
      const on = frame || inner || (edge >= 22 && mid);
      raw[o] = 200; raw[o + 1] = 30; raw[o + 2] = 30; raw[o + 3] = on ? 210 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
  return 'data:image/png;base64,' + png.toString('base64');
}

// ---- サンプルデータ ----
const settings = {
  issuer: {
    name: 'ちびイズム デザイン室',
    postal: '150-0001',
    address: '東京都渋谷区神宮前1-2-3\nサンプルビル 4F',
    tel: '03-1234-5678',
    email: 'hello@example.com',
    registrationNumber: 'T1234567890123',
    bank: 'みずほ銀行 渋谷支店（普通）1234567\n口座名義: チビイズム デザインシツ',
    sealDataUrl: sealPng(160)
  },
  rounding: 'floor'
};

const base = {
  number: '202610-001',
  clientSnapshot: {
    name: '株式会社サンプル商事', honorific: '御中', postal: '100-0005',
    address: '東京都千代田区丸の内9-9-9 丸の内サンプルタワー 27階 総務部経理課（このあたりは長い住所の折り返し確認です）',
    contactName: '山田 太郎'
  },
  title: '2026年10月分 ウェブサイト保守費用',
  issueDate: '2026-10-23',
  dueDate: '2026-11-30',
  withholding: false,
  notes: 'お振込手数料は貴社にてご負担くださいますようお願い申し上げます。\nご不明な点がございましたら、お気軽にお問い合わせください。'
};

const samples = {
  a_normal: Object.assign({}, base, {
    items: [
      { name: 'ウェブサイト保守（月額）', quantity: 1, unit: '式', unitPrice: 50000, taxRate: 10 },
      { name: '打ち合わせ用 お茶菓子', quantity: 12, unit: '個', unitPrice: 280, taxRate: 8 },
      { name: '追加ページ制作（採用情報ページ、レスポンシブ対応、写真素材の選定・加工を含む）', quantity: 2.5, unit: '日', unitPrice: 36000, taxRate: 10 }
    ]
  }),
  b_withholding: Object.assign({}, base, {
    number: '202610-002',
    clientSnapshot: { name: '佐藤 花子', honorific: '様', postal: '', address: '神奈川県横浜市中区1-1', contactName: '' },
    title: '講演料（2026年10月12日 セミナー）',
    withholding: true,
    items: [
      { name: '講演料', quantity: 1, unit: '式', unitPrice: 1200000, taxRate: 10 },
      { name: '原稿料', quantity: 1, unit: '式', unitPrice: 300000, taxRate: 10 }
    ],
    notes: ''
  }),
  c_many: Object.assign({}, base, {
    number: '202610-003',
    items: Array.from({ length: 45 }, (_, i) => ({
      name: (i % 7 === 3 ? '長い品目名の折り返し確認用の明細行です（デザイン修正・コーディング・検証作業一式）No.' : '作業項目 No.') + (i + 1),
      quantity: (i % 4) + 1, unit: i % 3 ? '時間' : '式', unitPrice: 4500 + i * 100, taxRate: i % 5 === 0 ? 8 : 10
    })),
    notes: Array.from({ length: 6 }, (_, i) => `備考 ${i + 1} 行目：長い備考の折り返し確認です。この文章は幅に合わせて文字単位で折り返されるはずです。句読点が行頭に来ないこと、（括弧）が行末に残らないことも確認します。`).join('\n')
  })
};

(async () => {
  const s = Calc.summarize(samples.b_withholding, 'floor');
  assert.strictEqual(s.withholding, 204200);
  for (const [key, inv] of Object.entries(samples)) {
    const bytes = await InvoicePDF.generate(inv, settings);
    assert.ok(bytes instanceof Uint8Array && bytes.length > 1000);
    const file = path.join(outDir, key + '.pdf');
    fs.writeFileSync(file, bytes);
    const doc = await window.PDFLib.PDFDocument.load(bytes);
    console.log(`${key}: ${file} (${(bytes.length / 1024).toFixed(0)} KB, ${doc.getPageCount()} pages)  name=${InvoicePDF.filename(inv)}`);
  }

  // ---- 見積書 ----
  // 日付の推定: 見積日 = 請求日の14日前（月・年またぎ）、有効期限 = 見積日 + 30日
  assert.deepStrictEqual(InvoicePDF.estimateFields({ number: '202601-001', issueDate: '2026-01-10' }),
    { number: 'Q202601-001', issueDate: '2025-12-27', validUntil: '2026-01-26' });
  assert.deepStrictEqual(InvoicePDF.estimateFields({ number: '202603-001', issueDate: '2026-03-10' }),
    { number: 'Q202603-001', issueDate: '2026-02-24', validUntil: '2026-03-26' });
  assert.deepStrictEqual(InvoicePDF.estimateFields({ number: 'x', issueDate: '2024-03-01' }).issueDate, '2024-02-16');
  assert.deepStrictEqual(InvoicePDF.estimateFields({ number: '1', issueDate: '2026-10-23', estimate: { number: 'E-9', issueDate: '2026-10-01' } }),
    { number: 'E-9', issueDate: '2026-10-01', validUntil: '2026-10-31' });
  assert.deepStrictEqual(InvoicePDF.estimateFields({ estimate: { validUntil: '2026-12-31' } }),
    { number: '', issueDate: '', validUntil: '2026-12-31' });
  const est = Object.assign({}, samples.a_normal, { withholding: true });
  const opts = { docType: 'estimate' };
  assert.strictEqual(InvoicePDF.filename(est, opts), '見積書_Q202610-001_株式会社サンプル商事.pdf');
  assert.strictEqual(InvoicePDF.filename(est), '請求書_202610-001_株式会社サンプル商事.pdf');
  const ebytes = await InvoicePDF.generate(est, settings, opts);
  fs.writeFileSync(path.join(outDir, 'd_estimate.pdf'), ebytes);
  console.log(`d_estimate: ${path.join(outDir, 'd_estimate.pdf')}  name=${InvoicePDF.filename(est, opts)}`);
  assert.strictEqual(fontFetches, 1, 'フォントは1回だけ読むこと');
  assert.strictEqual(InvoicePDF.filename({ number: '2026/10:001', clientSnapshot: { name: 'A社 <東京>' } }), '請求書_2026_10_001_A社_東京.pdf');
  console.log('PDF: ok');
})().catch((e) => { console.error(e); process.exit(1); });
