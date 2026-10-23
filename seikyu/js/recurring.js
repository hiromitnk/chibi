/* seikyu — Recurring: 定期請求の発行判定と生成
 * 日付はすべて "YYYY-MM-DD" 文字列で扱う（タイムゾーンの影響を受けない）。 */
(function (global) {
  'use strict';

  var MAX_LOOP = 600;

  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }

  function ymd(y, m, d) { return pad(y, 4) + '-' + pad(m, 2) + '-' + pad(d, 2); }

  function parse(s) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }

  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); } // m: 1-12

  // 月を足す（m は 1-12）。{y, m} を返す
  function addMonths(y, m, n) {
    var idx = y * 12 + (m - 1) + n;
    return { y: Math.floor(idx / 12), m: (idx % 12 + 12) % 12 + 1 };
  }

  // その月の day 日（0 または月の日数超え → 月末）
  function dayInMonth(y, m, day) {
    var last = daysInMonth(y, m);
    day = parseInt(day, 10) || 0;
    if (day <= 0 || day > last) day = last;
    return ymd(y, m, day);
  }

  function toYMD(today) {
    if (today == null) today = new Date();
    if (typeof today === 'string') {
      var p = parse(today);
      return p ? ymd(p.y, p.m, p.d) : null;
    }
    if (today instanceof Date) return ymd(today.getFullYear(), today.getMonth() + 1, today.getDate());
    return null;
  }

  function interval(rec) { return Math.max(1, parseInt(rec.intervalMonths, 10) || 1); }

  function computeFirstIssueDate(rec) {
    var s = parse(rec.startDate) || parse(toYMD(new Date()));
    var start = ymd(s.y, s.m, s.d);
    var cand = dayInMonth(s.y, s.m, rec.issueDay);
    if (cand < start) {
      var n = addMonths(s.y, s.m, 1);
      cand = dayInMonth(n.y, n.m, rec.issueDay);
    }
    return cand;
  }

  // 発行日の次の発行日（月で進めてから日を丸め直すので 31→2/28→3/31 になる）
  function advance(rec, dateStr) {
    var p = parse(dateStr);
    var n = addMonths(p.y, p.m, interval(rec));
    return dayInMonth(n.y, n.m, rec.issueDay);
  }

  function dueDateFor(rec, issueDate) {
    var p = parse(issueDate);
    var rule = rec.dueRule || { monthsAfter: 1, day: 0 };
    var n = addMonths(p.y, p.m, parseInt(rule.monthsAfter, 10) || 0);
    var due = dayInMonth(n.y, n.m, rule.day);
    if (due < issueDate) due = issueDate;
    return due;
  }

  // 差し込み。基準は「対象月」= 発行日の月
  //   {year} {year-1}            年（年単位でずらす）
  //   {month} {month+1} {MM}     月（月単位でずらす。1月の {month-1} は 12）
  //   {ym} {ym-1} {ym+1}         "2026年9月"（年も正しく繰り上がる／下がる）
  //   {lastday} {lastday-1}      その月の末日（数字）
  //   {date}                     発行日 "2026年10月25日"
  //   旧形式 {YYYY} {M} {MM} も使える
  function fill(tpl, issueDate) {
    var p = parse(issueDate);
    if (!p) return String(tpl || '');
    return String(tpl || '').replace(/\{(YYYY|M|MM|year|month|ym|lastday|date)(?:\s*([+-])\s*(\d+))?\}/g, function (all, key, sign, n) {
      var off = sign ? (sign === '-' ? -1 : 1) * parseInt(n, 10) : 0;
      if (key === 'date') return off ? all : p.y + '年' + p.m + '月' + p.d + '日';
      if (key === 'year' || key === 'YYYY') return String(p.y + off);
      var t = addMonths(p.y, p.m, off);
      if (key === 'month' || key === 'M') return String(t.m);
      if (key === 'MM') return pad(t.m, 2);
      if (key === 'ym') return t.y + '年' + t.m + '月';
      if (key === 'lastday') return String(daysInMonth(t.y, t.m));
      return all;
    });
  }

  function uuid() {
    if (global.Store && global.Store.uuid) return global.Store.uuid();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function takeNumber(state, issueDate) {
    if (global.Store && global.Store.nextNumber) return global.Store.nextNumber(issueDate, state);
    var seq = Math.max(1, parseInt(state.settings.nextSeq, 10) || 1);
    state.settings.nextSeq = seq + 1;
    var p = parse(issueDate);
    return String(state.settings.numberFormat || '{YYYY}{MM}-{SEQ3}')
      .replace(/\{YYYY\}/g, pad(p.y, 4)).replace(/\{MM\}/g, pad(p.m, 2)).replace(/\{DD\}/g, pad(p.d, 2))
      .replace(/\{SEQ4\}/g, pad(seq, 4)).replace(/\{SEQ3\}/g, pad(seq, 3)).replace(/\{SEQ\}/g, String(seq));
  }

  // 定期 rec から issueDate の請求書を1件作る（state の採番を進める）
  function buildInvoice(state, rec, issueDate) {
    var t = rec.template || {};
    var client = (state.clients || []).filter(function (c) { return c.id === t.clientId; })[0] || null;
    var now = new Date().toISOString(); // createdAt/updatedAt は ISO（時刻）でよい
    var title = rec.titleTemplate ? fill(rec.titleTemplate, issueDate) : fill(t.title, issueDate);
    return {
      id: uuid(),
      number: takeNumber(state, issueDate),
      clientId: t.clientId || '',
      clientSnapshot: client ? {
        name: client.name || '', honorific: client.honorific || '御中',
        postal: client.postal || '', address: client.address || '', contactName: client.contactName || ''
      } : { name: '', honorific: '御中', postal: '', address: '', contactName: '' },
      title: title,
      issueDate: issueDate,
      dueDate: dueDateFor(rec, issueDate),
      items: (t.items || []).map(function (it) {
        return {
          name: fill(it.name, issueDate),
          quantity: it.quantity, unit: it.unit || '', unitPrice: it.unitPrice,
          taxRate: it.taxRate
        };
      }),
      withholding: !!t.withholding,
      notes: fill(t.notes, issueDate),
      status: rec.autoStatus === 'issued' ? 'issued' : 'draft',
      recurringId: rec.id,
      createdAt: now,
      updatedAt: now
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function runDue(state, today) {
    var st = clone(state);
    var t = toYMD(today);
    var created = [];
    if (!t) return { state: st, created: created };
    st.invoices = st.invoices || [];
    (st.recurring || []).forEach(function (rec) {
      if (!rec.active) return;
      if (!parse(rec.nextIssueDate)) rec.nextIssueDate = computeFirstIssueDate(rec);
      var end = parse(rec.endDate) ? rec.endDate : '';
      var guard = 0;
      while (rec.nextIssueDate <= t && (!end || rec.nextIssueDate <= end) && guard++ < MAX_LOOP) {
        var inv = buildInvoice(st, rec, rec.nextIssueDate);
        st.invoices.push(inv);
        created.push(inv);
        rec.nextIssueDate = advance(rec, rec.nextIssueDate);
      }
    });
    return { state: st, created: created };
  }

  function preview(rec, count) {
    count = count == null ? 6 : count;
    var out = [];
    var d = parse(rec.nextIssueDate) ? rec.nextIssueDate : computeFirstIssueDate(rec);
    var end = parse(rec.endDate) ? rec.endDate : '';
    for (var i = 0; i < count && (!end || d <= end); i++) {
      out.push(d);
      d = advance(rec, d);
    }
    return out;
  }

  global.Recurring = {
    computeFirstIssueDate: computeFirstIssueDate,
    runDue: runDue,
    preview: preview,
    buildInvoice: buildInvoice,
    nextAfter: advance,
    dueDateFor: dueDateFor,
    fillTemplate: fill,
    toYMD: toYMD,
    dayInMonth: dayInMonth,
    addMonths: addMonths
  };
})(typeof window !== 'undefined' ? window : globalThis);
