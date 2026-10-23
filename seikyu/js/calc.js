// 金額計算（税率ごとの集計・源泉徴収）
(function () {
  'use strict';

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  // 端数処理
  function roundBy(n, rounding) {
    if (rounding === 'round') return Math.round(n);
    if (rounding === 'ceil') return Math.ceil(n);
    return Math.floor(n);
  }

  function lineAmount(item) {
    if (!item) return 0;
    return Math.round(num(item.quantity) * num(item.unitPrice));
  }

  // 源泉徴収税額: 100万円以下 10.21%、超える部分 20.42%、1円未満切り捨て
  // 浮動小数の誤差を避けるため整数で計算する（10.21% = 1021/10000）
  function withholdingTax(base) {
    base = Math.floor(num(base));
    if (base <= 0) return 0;
    if (base <= 1000000) return Math.floor(base * 1021 / 10000);
    return Math.floor((1000000 * 1021 + (base - 1000000) * 2042) / 10000);
  }

  function summarize(invoice, rounding) {
    var items = (invoice && invoice.items) || [];
    var bases = {};
    var subtotal = 0;
    items.forEach(function (it) {
      var amt = lineAmount(it);
      var rate = num(it.taxRate);
      bases[rate] = (bases[rate] || 0) + amt;
      subtotal += amt;
    });

    var rates = Object.keys(bases).map(Number).sort(function (a, b) { return b - a; });
    var byRate = [];
    var taxTotal = 0;
    rates.forEach(function (rate) {
      var base = bases[rate];
      if (base === 0) return;
      // 税率ごとに1回だけ端数処理（インボイス制度）
      var tax = rate > 0 ? roundBy(base * rate / 100, rounding) : 0;
      if (tax === 0) tax = 0; // -0 を避ける
      byRate.push({ rate: rate, base: base, tax: tax });
      taxTotal += tax;
    });

    var total = subtotal + taxTotal;
    var withholding = invoice && invoice.withholding ? withholdingTax(subtotal) : 0;
    return {
      byRate: byRate,
      subtotal: subtotal,
      taxTotal: taxTotal,
      total: total,
      withholding: withholding,
      billed: total - withholding
    };
  }

  function yen(n) {
    n = Math.round(num(n));
    var s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + '¥' + s;
  }

  window.Calc = {
    lineAmount: lineAmount,
    summarize: summarize,
    withholdingTax: withholdingTax,
    yen: yen
  };
})();
