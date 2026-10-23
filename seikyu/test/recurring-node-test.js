// node seikyu/test/recurring-node-test.js
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ctx = { console: console, Date: Date, JSON: JSON, Math: Math };
ctx.window = ctx;
ctx.crypto = require('crypto').webcrypto;
vm.createContext(ctx);
['store.js', 'recurring.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
});
var Store = ctx.Store, R0 = ctx.Recurring;
// vm の別 realm の配列を deepStrictEqual できるよう JSON で持ち込む
function plain(v) { return JSON.parse(JSON.stringify(v)); }
var R = {
  computeFirstIssueDate: R0.computeFirstIssueDate,
  dueDateFor: R0.dueDateFor,
  preview: function (r, c) { return plain(R0.preview(r, c)); },
  runDue: function (s, d) { return plain(R0.runDue(s, d)); }
};

function baseState() {
  var s = Store.defaults();
  s.clients.push({ id: 'c1', name: '株式会社テスト', honorific: '御中', postal: '100-0001', address: '東京都千代田区', contactName: '山田', email: '', memo: '' });
  return s;
}
function rec(over) {
  var r = {
    id: 'r1', name: 'テスト', active: true,
    template: { clientId: 'c1', title: '', items: [{ name: '{YYYY}年{M}月分 保守', quantity: 1, unit: '式', unitPrice: 50000, taxRate: 10 }], withholding: false, notes: '' },
    intervalMonths: 1, issueDay: 25, dueRule: { monthsAfter: 1, day: 0 },
    startDate: '2026-11-01', endDate: '', nextIssueDate: '',
    titleTemplate: '{YYYY}年{MM}月分 保守費用', autoStatus: 'draft'
  };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
var n = 0;
function t(name, fn) { fn(); n++; console.log('ok - ' + name); }

t('computeFirstIssueDate: 開始日以降の最初の発行日', function () {
  assert.strictEqual(R.computeFirstIssueDate(rec()), '2026-11-25');
  assert.strictEqual(R.computeFirstIssueDate(rec({ startDate: '2026-11-26' })), '2026-12-25');
  assert.strictEqual(R.computeFirstIssueDate(rec({ startDate: '2026-11-25' })), '2026-11-25');
  assert.strictEqual(R.computeFirstIssueDate(rec({ issueDay: 0, startDate: '2027-02-10' })), '2027-02-28');
});

t('月末丸め: issueDay 31 は 2月で 28日、3月で 31日に戻る', function () {
  var r = rec({ issueDay: 31, startDate: '2027-01-01' });
  assert.deepStrictEqual(R.preview(r, 4), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  var leap = rec({ issueDay: 31, startDate: '2028-02-01' });
  assert.strictEqual(R.preview(leap, 1)[0], '2028-02-29');
  var zero = rec({ issueDay: 0, startDate: '2027-01-01' });
  assert.deepStrictEqual(R.preview(zero, 3), ['2027-01-31', '2027-02-28', '2027-03-31']);
});

t('取りこぼし 3か月分をまとめて作成、採番と件名・品目の差し込み', function () {
  var s = baseState();
  s.recurring.push(rec({ startDate: '2026-08-01' }));
  var res = R.runDue(s, '2026-10-26');
  assert.strictEqual(res.created.length, 3);
  assert.deepStrictEqual(res.created.map(function (i) { return i.issueDate; }), ['2026-08-25', '2026-09-25', '2026-10-25']);
  assert.deepStrictEqual(res.created.map(function (i) { return i.number; }), ['202608-001', '202609-002', '202610-003']);
  assert.strictEqual(res.created[0].title, '2026年08月分 保守費用');
  assert.strictEqual(res.created[1].items[0].name, '2026年9月分 保守');
  assert.strictEqual(res.created[0].dueDate, '2026-09-30');
  assert.strictEqual(res.created[2].dueDate, '2026-11-30');
  assert.strictEqual(res.created[0].clientSnapshot.name, '株式会社テスト');
  assert.strictEqual(res.created[0].recurringId, 'r1');
  assert.strictEqual(res.state.settings.nextSeq, 4);
  assert.strictEqual(res.state.recurring[0].nextIssueDate, '2026-11-25');
  assert.strictEqual(res.state.invoices.length, 3);
  // 元の state は変更しない
  assert.strictEqual(s.invoices.length, 0);
  // 再実行しても重複しない
  var again = R.runDue(res.state, '2026-10-26');
  assert.strictEqual(again.created.length, 0);
});

t('today が Date でもローカル日付で判定', function () {
  var s = baseState();
  s.recurring.push(rec({ startDate: '2026-10-01' }));
  assert.strictEqual(R.runDue(s, new Date(2026, 9, 25, 0, 5)).created.length, 1);
  assert.strictEqual(R.runDue(s, new Date(2026, 9, 24, 23, 59)).created.length, 0);
});

t('intervalMonths 3（四半期）', function () {
  var r = rec({ intervalMonths: 3, issueDay: 31, startDate: '2026-11-01' });
  assert.deepStrictEqual(R.preview(r, 4), ['2026-11-30', '2027-02-28', '2027-05-31', '2027-08-31']);
  var s = baseState();
  s.recurring.push(rec({ intervalMonths: 3, startDate: '2026-01-01' }));
  var res = R.runDue(s, '2026-10-23');
  assert.deepStrictEqual(res.created.map(function (i) { return i.issueDate; }), ['2026-01-25', '2026-04-25', '2026-07-25']);
  assert.strictEqual(res.state.recurring[0].nextIssueDate, '2026-10-25');
});

t('endDate で止まる', function () {
  var s = baseState();
  s.recurring.push(rec({ startDate: '2026-06-01', endDate: '2026-08-31' }));
  var res = R.runDue(s, '2026-12-31');
  assert.deepStrictEqual(res.created.map(function (i) { return i.issueDate; }), ['2026-06-25', '2026-07-25', '2026-08-25']);
  assert.deepStrictEqual(R.preview(rec({ startDate: '2026-06-01', endDate: '2026-07-25' }), 6), ['2026-06-25', '2026-07-25']);
});

t('active=false は作らない', function () {
  var s = baseState();
  s.recurring.push(rec({ startDate: '2026-01-01', active: false }));
  assert.strictEqual(R.runDue(s, '2026-12-31').created.length, 0);
});

t('dueRule: 当月末 / 翌月10日 / 2か月後末', function () {
  assert.strictEqual(R.dueDateFor(rec({ dueRule: { monthsAfter: 0, day: 0 } }), '2027-02-25'), '2027-02-28');
  assert.strictEqual(R.dueDateFor(rec({ dueRule: { monthsAfter: 1, day: 10 } }), '2026-12-25'), '2027-01-10');
  assert.strictEqual(R.dueDateFor(rec({ dueRule: { monthsAfter: 2, day: 31 } }), '2026-12-25'), '2027-02-28');
});

t('autoStatus issued', function () {
  var s = baseState();
  s.recurring.push(rec({ startDate: '2026-10-01', autoStatus: 'issued' }));
  assert.strictEqual(R.runDue(s, '2026-10-25').created[0].status, 'issued');
});

t('fillTemplate: 年月の差し込みと繰り上がり', function () {
  var f = R0.fillTemplate;
  assert.strictEqual(f('{YYYY}年{M}月分 {MM}', '2026-10-25'), '2026年10月分 10');
  assert.strictEqual(f('{year}/{month}/{MM} {date}', '2026-03-05'), '2026/3/03 2026年3月5日');
  // 1月の前月
  assert.strictEqual(f('{month-1}月分 {ym-1}分 {MM-1} {year-1}', '2027-01-25'), '12月分 2026年12月分 12 2026');
  // 12月の翌月
  assert.strictEqual(f('{month+1} {ym+1} {year+1}', '2026-12-25'), '1 2027年1月 2027');
  assert.strictEqual(f('{ym}', '2026-12-25'), '2026年12月');
  // 末日
  assert.strictEqual(f('{lastday}', '2027-02-10'), '28');
  assert.strictEqual(f('{lastday-1}', '2027-03-10'), '28');
  assert.strictEqual(f('{lastday}', '2028-02-01'), '29');
  assert.strictEqual(f('{month-13}', '2027-01-25'), '12');
  assert.strictEqual(f('{unknown} {date+1}', '2027-01-25'), '{unknown} {date+1}');
});

t('品目・備考にも差し込む（前月分）', function () {
  var s = baseState();
  s.recurring.push(rec({ startDate: '2027-01-01', titleTemplate: '{ym-1}分 保守費用',
    template: { clientId: 'c1', title: '', items: [{ name: '{month-1}/1〜{month-1}/{lastday-1} 保守', quantity: 1, unit: '式', unitPrice: 1000, taxRate: 10 }], withholding: false, notes: '{date} 発行' } }));
  var inv = R.runDue(s, '2027-01-25').created[0];
  assert.strictEqual(inv.title, '2026年12月分 保守費用');
  assert.strictEqual(inv.items[0].name, '12/1〜12/31 保守');
  assert.strictEqual(inv.notes, '2027年1月25日 発行');
});

t('Store.formatNumber', function () {
  assert.strictEqual(Store.formatNumber('INV-{YYYY}{MM}{DD}-{SEQ4}', '2026-10-23', 7), 'INV-20261023-0007');
  assert.strictEqual(Store.formatNumber('{SEQ}', '2026-10-23', 12), '12');
});

console.log('\n' + n + ' tests passed');
