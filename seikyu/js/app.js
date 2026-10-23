/* seikyu — 画面とイベント */
(function () {
  'use strict';

  var Store = window.Store, Calc = window.Calc, Recurring = window.Recurring, Sync = window.Sync;
  var state;
  var app = document.getElementById('app');

  /* ---------- 小道具 ---------- */

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nl2br(v) { return esc(v).replace(/\n/g, '<br>'); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function today() { return Store.today(); }
  function nowISO() { return new Date().toISOString(); }
  function fmtDate(s) { return s ? String(s).replace(/-/g, '/') : '—'; }
  function fmtDateW(s) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!p) return '—';
    return p[1] + '/' + p[2] + '/' + p[3] + '（' + '日月火水木金土'[new Date(+p[1], +p[2] - 1, +p[3]).getDay()] + '）';
  }
  function fmtDateJa(s) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!p) return '—';
    var w = '日月火水木金土'[new Date(+p[1], +p[2] - 1, +p[3]).getDay()];
    return +p[1] + '年' + (+p[2]) + '月' + (+p[3]) + '日（' + w + '）';
  }
  function yen(n) { return Calc ? Calc.yen(n) : String(n); }
  function num(v) { var n = Number(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function save() {
    if (!Store.save(state)) toast('保存できませんでした（ブラウザの保存領域がいっぱいかもしれません）', true);
  }
  function remote() { return Sync && Sync.mode === 'remote'; }
  function findClient(id) { return state.clients.filter(function (c) { return c.id === id; })[0] || null; }
  function findInvoice(id) { return state.invoices.filter(function (c) { return c.id === id; })[0] || null; }
  function findRec(id) { return state.recurring.filter(function (c) { return c.id === id; })[0] || null; }
  function summarize(inv) { return Calc.summarize(inv, state.settings.rounding); }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  var STATUS = { draft: '下書き', issued: '発行済', paid: '入金済' };
  function isOverdue(inv) { return inv.status === 'issued' && inv.dueDate && inv.dueDate < today(); }

  var toastTimer;
  function toast(msg, isError) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2600);
  }

  function showBanner(msg) {
    var b = document.getElementById('banner');
    b.innerHTML = '<div class="banner-inner"><span>' + esc(msg) + '</span>' +
      '<a href="#/invoices" class="banner-link">一覧で見る</a>' +
      '<button type="button" class="banner-close" aria-label="閉じる">×</button></div>';
    b.hidden = false;
    $('.banner-close', b).onclick = function () { b.hidden = true; };
  }

  function runRecurring() {
    var res = Recurring.runDue(state, new Date());
    state = res.state;
    Store.state = state;
    if (res.created.length) {
      save();
      showBanner('定期請求から ' + res.created.length + ' 件作成しました');
    }
    return res.created;
  }

  function newItem() {
    return { name: '', quantity: 1, unit: '', unitPrice: 0, taxRate: Number(state.settings.defaultTaxRate) };
  }

  function snapshotOf(c) {
    return c ? { name: c.name, honorific: c.honorific || '御中', postal: c.postal, address: c.address, contactName: c.contactName }
      : { name: '', honorific: '御中', postal: '', address: '', contactName: '' };
  }

  function clientOptions(selected, emptyLabel) {
    var html = '<option value="">' + esc(emptyLabel || '選択してください') + '</option>';
    state.clients.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ja'); }).forEach(function (c) {
      html += '<option value="' + esc(c.id) + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(c.name) + ' ' + esc(c.honorific) + '</option>';
    });
    return html;
  }

  function opts(list, selected) {
    return list.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(selected) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('');
  }

  var TAX_OPTS = [[10, '10%'], [8, '8%（軽減）'], [0, '0%']];

  function pageHead(title, sub, actions) {
    return '<div class="page-head"><div><h1>' + esc(title) + '</h1>' +
      (sub ? '<p class="page-sub">' + sub + '</p>' : '') + '</div>' +
      (actions ? '<div class="page-actions">' + actions + '</div>' : '') + '</div>';
  }

  function field(label, control, opt) {
    opt = opt || {};
    return '<label class="field' + (opt.cls ? ' ' + opt.cls : '') + '"><span class="label">' + esc(label) +
      (opt.req ? ' <em class="req">必須</em>' : '') + '</span>' + control +
      (opt.hint ? '<span class="hint">' + opt.hint + '</span>' : '') + '</label>';
  }
  function input(name, value, attrs) {
    return '<input name="' + esc(name) + '" value="' + esc(value) + '" ' + (attrs || '') + '>';
  }
  function textarea(name, value, rows) {
    return '<textarea name="' + esc(name) + '" rows="' + (rows || 3) + '">' + esc(value) + '</textarea>';
  }

  /* ---------- PDF ---------- */

  function pdfReady() {
    if (!window.InvoicePDF) { toast('PDF 機能を読み込めていません', true); return false; }
    return true;
  }
  function pdfDownload(inv, opts) {
    if (!pdfReady()) return Promise.resolve();
    toast('PDF を作成しています…');
    return Promise.resolve(opts ? window.InvoicePDF.download(inv, state.settings, opts) : window.InvoicePDF.download(inv, state.settings))
      .then(function () { toast('PDF をダウンロードしました'); })
      .catch(function (e) { console.error(e); toast('PDF を作成できませんでした: ' + (e && e.message || e), true); });
  }
  var previewUrl = null;
  function pdfPreview(inv, opts) {
    if (!pdfReady()) return Promise.resolve();
    toast('プレビューを作成しています…');
    return Promise.resolve(opts ? window.InvoicePDF.generate(inv, state.settings, opts) : window.InvoicePDF.generate(inv, state.settings)).then(function (bytes) {
      document.getElementById('preview').querySelector('.preview-title').textContent = opts && opts.docType === 'estimate' ? '見積書のプレビュー' : '請求書のプレビュー';
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      var p = document.getElementById('preview');
      document.getElementById('preview-frame').src = previewUrl;
      document.getElementById('preview-open').href = previewUrl;
      p.hidden = false;
      document.body.classList.add('no-scroll');
      document.getElementById('toast').className = 'toast';
    }).catch(function (e) { console.error(e); toast('PDF を作成できませんでした: ' + (e && e.message || e), true); });
  }
  function closePreview() {
    var p = document.getElementById('preview');
    p.hidden = true;
    document.getElementById('preview-frame').src = 'about:blank';
    document.body.classList.remove('no-scroll');
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close-preview]') || e.target.id === 'preview') closePreview();
  });
  document.addEventListener('click', function (e) {
    $$('details.menu[open]').forEach(function (d) {
      if (!d.contains(e.target) || e.target.closest('.menu-pop button')) d.open = false;
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !document.getElementById('preview').hidden) closePreview();
  });

  /* ---------- 見積書 ---------- */

  function addDays(dateStr, n) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    var d = p ? new Date(+p[1], +p[2] - 1, +p[3] + n) : new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // inv は state.invoices 内の保存済みオブジェクト。onSaved(inv) は見積を保存したあと
  function openEstimateDialog(inv, onSaved) {
    var est = inv.estimate || {};
    var issue = est.issueDate || addDays(inv.issueDate || today(), -14);
    var valid = est.validUntil || addDays(issue, 30);
    var number = est.number || ('Q' + (inv.number || ''));
    var validTouched = !!est.validUntil;
    var dlg = document.getElementById('estimate');
    dlg.innerHTML = '<form class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="est-title" novalidate>' +
      '<div class="dialog-head"><h2 id="est-title">見積書を作成</h2><button type="button" class="icon-btn" data-close aria-label="閉じる">×</button></div>' +
      '<p class="hint">内容は請求書と同じで、日付と番号だけが変わります。' + (inv.estimate ? '前回の設定を読み込みました。' : '') + '</p>' +
      '<div class="grid">' +
        field('見積日', input('issueDate', issue, 'type="date"'), { hint: '初期値は請求日の2週間前' }) +
        field('有効期限', input('validUntil', valid, 'type="date"'), { hint: '初期値は見積日の30日後' }) +
        field('見積番号', input('number', number), { cls: 'span-2' }) +
      '</div>' +
      '<div class="dialog-actions"><button type="button" class="btn btn-ghost" data-close>キャンセル</button>' +
        '<button type="button" class="btn" data-act="preview">プレビュー</button>' +
        '<button type="submit" class="btn btn-primary">保存してPDF</button></div>' +
      '</form>';
    dlg.hidden = false;
    document.body.classList.add('no-scroll');
    var form = $('form', dlg);
    form.elements.issueDate.focus();
    form.elements.issueDate.oninput = function () {
      if (!validTouched && form.elements.issueDate.value) form.elements.validUntil.value = addDays(form.elements.issueDate.value, 30);
    };
    form.elements.validUntil.oninput = function () { validTouched = true; };
    function close() { dlg.hidden = true; dlg.innerHTML = ''; document.body.classList.remove('no-scroll'); }
    $$('[data-close]', dlg).forEach(function (b) { b.onclick = close; });
    dlg.onclick = function (e) { if (e.target === dlg) close(); };
    dlg.onkeydown = function (e) { if (e.key === 'Escape') close(); };
    function commit() {
      var e = { number: form.elements.number.value.trim(), issueDate: form.elements.issueDate.value, validUntil: form.elements.validUntil.value };
      if (!e.issueDate) { toast('見積日を入力してください', true); return null; }
      if (!e.number) { toast('見積番号を入力してください', true); return null; }
      inv.estimate = e;
      inv.updatedAt = nowISO();
      save();
      if (onSaved) onSaved(inv);
      return inv;
    }
    form.onsubmit = function (ev) {
      ev.preventDefault();
      if (!commit()) return;
      close();
      pdfDownload(inv, { docType: 'estimate' });
    };
    $('[data-act=preview]', form).onclick = function () {
      if (!commit()) return;
      close();
      pdfPreview(inv, { docType: 'estimate' });
    };
  }

  /* ---------- 請求書一覧 ---------- */

  var listFilter = { status: 'all', q: '' };

  function renderInvoices() {
    var all = state.invoices;
    var t = today();
    var ym = t.slice(0, 7);
    var unpaid = 0, unpaidN = 0, overdueN = 0, monthTotal = 0;
    all.forEach(function (inv) {
      var s = summarize(inv);
      if (inv.status === 'issued') { unpaid += s.billed; unpaidN++; if (isOverdue(inv)) overdueN++; }
      if ((inv.issueDate || '').slice(0, 7) === ym && inv.status !== 'draft') monthTotal += s.billed;
    });

    var counts = { all: all.length, draft: 0, issued: 0, paid: 0 };
    all.forEach(function (i) { counts[i.status] = (counts[i.status] || 0) + 1; });

    var tabs = [['all', 'すべて'], ['draft', '下書き'], ['issued', '発行済'], ['paid', '入金済']].map(function (o) {
      return '<button type="button" class="seg' + (listFilter.status === o[0] ? ' on' : '') + '" data-status="' + o[0] + '">' +
        esc(o[1]) + '<span class="seg-n">' + (counts[o[0]] || 0) + '</span></button>';
    }).join('');

    app.innerHTML =
      pageHead('請求書', '', '<a class="btn btn-primary" href="#/invoices/new">＋ 新しい請求書</a>') +
      '<section class="stats">' +
        '<div class="stat"><span class="stat-label">未入金</span><span class="stat-value">' + yen(unpaid) + '</span><span class="stat-note">' + unpaidN + ' 件' + (overdueN ? ' ・ <b class="warn-text">期限超過 ' + overdueN + ' 件</b>' : '') + '</span></div>' +
        '<div class="stat"><span class="stat-label">' + (+ym.slice(5)) + '月の請求額</span><span class="stat-value">' + yen(monthTotal) + '</span><span class="stat-note">発行済・入金済の合計</span></div>' +
      '</section>' +
      '<div class="toolbar"><div class="segs" role="tablist">' + tabs + '</div>' +
        '<input type="search" class="search" placeholder="番号・取引先・件名で検索" value="' + esc(listFilter.q) + '" aria-label="検索"></div>' +
      '<div id="inv-list"></div>';

    $$('.seg', app).forEach(function (b) {
      b.onclick = function () { listFilter.status = b.dataset.status; renderInvoices(); };
    });
    var search = $('.search', app);
    search.oninput = function () { listFilter.q = search.value; renderInvoiceRows(); };
    renderInvoiceRows();
  }

  function renderInvoiceRows() {
    var q = listFilter.q.trim().toLowerCase();
    var rows = state.invoices.filter(function (inv) {
      if (listFilter.status !== 'all' && inv.status !== listFilter.status) return false;
      if (!q) return true;
      var hay = [inv.number, inv.clientSnapshot && inv.clientSnapshot.name, inv.title].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    }).sort(function (a, b) {
      return (b.issueDate || '').localeCompare(a.issueDate || '') || (b.number || '').localeCompare(a.number || '');
    });

    var box = document.getElementById('inv-list');
    if (!state.invoices.length) {
      box.innerHTML = '<div class="empty"><p class="empty-title">まだ請求書がありません</p>' +
        '<p>' + (state.clients.length ? '' : 'はじめに<a href="#/settings">設定</a>で自分の情報を、<a href="#/clients">取引先</a>を登録しておくと便利です。') + '</p>' +
        '<a class="btn btn-primary" href="#/invoices/new">＋ 新しい請求書</a></div>';
      return;
    }
    if (!rows.length) { box.innerHTML = '<div class="empty"><p>該当する請求書はありません</p></div>'; return; }

    var html = '<table class="table inv-table"><thead><tr>' +
      '<th>請求日</th><th>番号</th><th>取引先 / 件名</th><th class="num">ご請求金額</th><th>期限</th><th>状態</th><th class="actions-col"><span class="sr">操作</span></th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (inv) {
      var s = summarize(inv);
      var od = isOverdue(inv);
      var cs = inv.clientSnapshot || {};
      html += '<tr data-id="' + esc(inv.id) + '">' +
        '<td data-label="請求日" class="nowrap">' + esc(fmtDate(inv.issueDate)) + '</td>' +
        '<td data-label="番号" class="mono nowrap">' + esc(inv.number || '—') + (inv.recurringId ? ' <span class="tag" title="定期請求から作成">定期</span>' : '') + (inv.estimate ? ' <span class="tag tag-est" title="見積 ' + esc(inv.estimate.number) + '">見積あり</span>' : '') + '</td>' +
        '<td class="cell-main"><a href="#/invoices/' + esc(inv.id) + '" class="row-link"><span class="client-name">' + esc(cs.name || '（宛先未設定）') + '</span>' +
          '<span class="row-title">' + esc(inv.title || '件名なし') + '</span></a></td>' +
        '<td data-label="金額" class="num strong">' + yen(s.billed) + '</td>' +
        '<td data-label="期限" class="nowrap' + (od ? ' warn-text' : '') + '">' + esc(fmtDate(inv.dueDate)) + (od ? '<span class="od">超過</span>' : '') + '</td>' +
        '<td data-label="状態"><select class="status-select st-' + esc(inv.status) + '" data-act="status" aria-label="状態">' +
          opts([['draft', '下書き'], ['issued', '発行済'], ['paid', '入金済']], inv.status) + '</select></td>' +
        '<td class="row-actions">' +
          '<a class="btn btn-ghost btn-sm" href="#/invoices/' + esc(inv.id) + '">編集</a>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-act="pdf">PDF</button>' +
          '<details class="menu"><summary class="btn btn-ghost btn-sm" aria-label="その他の操作">…</summary><div class="menu-pop">' +
            '<button type="button" data-act="dup">複製</button>' +
            '<button type="button" data-act="est">見積書を作成（2週間前）</button>' +
            '<button type="button" class="danger" data-act="del">削除</button>' +
          '</div></details>' +
        '</td></tr>';
    });
    html += '</tbody></table>';
    box.innerHTML = html;

    $$('tr[data-id]', box).forEach(function (tr) {
      var inv = findInvoice(tr.dataset.id);
      $('[data-act=status]', tr).onchange = function (e) {
        inv.status = e.target.value; inv.updatedAt = nowISO(); save();
        toast('「' + STATUS[inv.status] + '」にしました');
        renderInvoices();
      };
      $('[data-act=dup]', tr).onclick = function () { duplicateInvoice(inv); };
      $('[data-act=pdf]', tr).onclick = function () { pdfDownload(inv); };
      $('[data-act=est]', tr).onclick = function () { openEstimateDialog(inv, function () { renderInvoiceRows(); }); };
      $('[data-act=del]', tr).onclick = function () {
        if (!confirm('請求書「' + (inv.number || inv.title || '') + '」を削除します。よろしいですか？')) return;
        state.invoices = state.invoices.filter(function (x) { return x.id !== inv.id; });
        save(); toast('削除しました'); renderInvoices();
      };
    });
  }

  var pendingDraft = null;
  function duplicateInvoice(inv) {
    var d = clone(inv);
    d.id = ''; d.number = ''; d.status = 'draft'; d.recurringId = null;
    d.issueDate = today();
    d.createdAt = ''; d.updatedAt = '';
    pendingDraft = d;
    go('#/invoices/new');
    toast('複製しました。内容を確認して保存してください');
  }

  /* ---------- 明細エディタ（請求書・定期請求で共用） ---------- */

  function itemsEditorHTML(items) {
    var rows = items.map(function (it, i) {
      return '<div class="item" data-i="' + i + '">' +
        '<div class="item-name">' + input('name', it.name, 'placeholder="品目" aria-label="品目"') + '</div>' +
        '<div class="item-qty"><span class="mlabel">数量</span>' + input('quantity', it.quantity, 'type="number" step="any" inputmode="decimal" aria-label="数量"') + '</div>' +
        '<div class="item-unit"><span class="mlabel">単位</span>' + input('unit', it.unit, 'placeholder="式" aria-label="単位"') + '</div>' +
        '<div class="item-price"><span class="mlabel">単価</span>' + input('unitPrice', it.unitPrice, 'type="number" step="any" inputmode="decimal" aria-label="単価"') + '</div>' +
        '<div class="item-tax"><span class="mlabel">税率</span><select name="taxRate" aria-label="税率">' + opts(TAX_OPTS, it.taxRate) + '</select></div>' +
        '<div class="item-amount" data-amount>' + yen(Calc.lineAmount(it)) + '</div>' +
        '<div class="item-ops">' +
          '<button type="button" class="icon-btn" data-op="up" aria-label="上へ"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="icon-btn" data-op="down" aria-label="下へ"' + (i === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="icon-btn" data-op="del" aria-label="この行を削除">×</button>' +
        '</div></div>';
    }).join('');
    return '<div class="items-head" aria-hidden="true"><span>品目</span><span>数量</span><span>単位</span><span>単価</span><span>税率</span><span class="num">金額</span><span></span></div>' +
      '<div class="items-body">' + (rows || '<p class="items-empty">明細がありません</p>') + '</div>' +
      '<button type="button" class="btn btn-ghost add-item" data-op="add">＋ 行を追加</button>';
  }

  // container 内の明細を items（配列）と双方向に結ぶ。onChange は金額が変わったとき
  function bindItems(container, items, onChange) {
    function draw() {
      container.innerHTML = itemsEditorHTML(items);
      onChange();
    }
    container.oninput = function (e) {
      var row = e.target.closest('.item'); if (!row) return;
      var it = items[+row.dataset.i], n = e.target.name;
      if (n === 'quantity' || n === 'unitPrice' || n === 'taxRate') it[n] = e.target.value === '' ? '' : num(e.target.value);
      else it[n] = e.target.value;
      $('[data-amount]', row).textContent = yen(Calc.lineAmount(it));
      onChange();
    };
    container.onchange = container.oninput;
    container.onclick = function (e) {
      var b = e.target.closest('[data-op]'); if (!b) return;
      var op = b.dataset.op;
      if (op === 'add') {
        items.push(newItem()); draw();
        var names = $$('.item input[name=name]', container); if (names.length) names[names.length - 1].focus();
        return;
      }
      var i = +b.closest('.item').dataset.i;
      if (op === 'del') items.splice(i, 1);
      if (op === 'up' && i > 0) items.splice(i - 1, 0, items.splice(i, 1)[0]);
      if (op === 'down' && i < items.length - 1) items.splice(i + 1, 0, items.splice(i, 1)[0]);
      draw();
    };
    draw();
  }

  function totalsHTML(inv) {
    var s = summarize(inv);
    var h = '<dl class="totals">' +
      '<div><dt>小計（税抜）</dt><dd>' + yen(s.subtotal) + '</dd></div>';
    s.byRate.forEach(function (r) {
      h += '<div class="sub"><dt>' + r.rate + '%対象 ' + yen(r.base) + '</dt><dd>' + (r.rate ? '消費税 ' + yen(r.tax) : '—') + '</dd></div>';
    });
    h += '<div><dt>消費税</dt><dd>' + yen(s.taxTotal) + '</dd></div>' +
      '<div><dt>合計（税込）</dt><dd>' + yen(s.total) + '</dd></div>';
    if (inv.withholding) h += '<div><dt>源泉徴収税額</dt><dd>▲' + yen(s.withholding) + '</dd></div>';
    h += '<div class="grand"><dt>ご請求金額</dt><dd>' + yen(s.billed) + '</dd></div></dl>';
    return h;
  }

  /* ---------- 請求書編集 ---------- */

  function renderInvoiceEdit(id) {
    var existing = id && id !== 'new' ? findInvoice(id) : null;
    if (id !== 'new' && !existing) { app.innerHTML = notFound('請求書', '#/invoices'); return; }
    var inv;
    if (existing) inv = clone(existing);
    else if (pendingDraft) { inv = pendingDraft; pendingDraft = null; }
    else {
      inv = {
        id: '', number: '', clientId: '', clientSnapshot: snapshotOf(null), title: '',
        issueDate: today(), dueDate: Recurring.dueDateFor({ dueRule: { monthsAfter: 1, day: 0 } }, today()),
        items: [newItem()], withholding: false, notes: state.settings.defaultNotes || '',
        status: 'draft', recurringId: null, createdAt: '', updatedAt: ''
      };
    }
    var isNew = !existing;
    var cs = inv.clientSnapshot;

    app.innerHTML =
      pageHead(isNew ? '新しい請求書' : '請求書の編集',
        '<a href="#/invoices" class="back">← 一覧へ</a>' + (inv.recurringId && findRec(inv.recurringId) ? '<span class="dot">・</span>定期請求「<a href="#/recurring/' + esc(inv.recurringId) + '">' + esc(findRec(inv.recurringId).name || '無題') + '</a>」から作成' : '')) +
      '<form id="inv-form" class="editor" autocomplete="off" novalidate>' +
        '<div class="editor-main">' +
          '<section class="card"><h2 class="card-title">宛先</h2>' +
            '<div class="grid">' +
              field('取引先', '<select name="clientId">' + clientOptions(inv.clientId, '（取引先から選ぶ）') + '</select>',
                { cls: 'span-2', hint: state.clients.length ? '選ぶと下の宛先に反映されます。宛先は請求書ごとに保存されます。' : '<a href="#/clients/new">取引先を登録</a>すると選べるようになります。' }) +
              field('宛名', input('snap.name', cs.name, 'placeholder="株式会社〇〇"'), { req: true }) +
              field('敬称', '<select name="snap.honorific">' + opts([['御中', '御中'], ['様', '様']], cs.honorific) + '</select>', { cls: 'narrow' }) +
              field('郵便番号', input('snap.postal', cs.postal, 'placeholder="100-0001" inputmode="numeric"'), { cls: 'narrow' }) +
              field('ご担当者', input('snap.contactName', cs.contactName, 'placeholder="山田 太郎 様"')) +
              field('住所', textarea('snap.address', cs.address, 2), { cls: 'span-2' }) +
            '</div></section>' +

          '<section class="card"><h2 class="card-title">基本情報</h2><div class="grid">' +
            field('件名', input('title', inv.title, 'placeholder="〇〇制作費"'), { cls: 'span-2' }) +
            field('請求日', input('issueDate', inv.issueDate, 'type="date"')) +
            field('お支払期限', input('dueDate', inv.dueDate, 'type="date"')) +
            field('請求書番号', input('number', inv.number, 'placeholder="自動：' + esc(Store.peekNumber(inv.issueDate || today(), state)) + '"'), { hint: '空欄なら保存時に自動で振ります' }) +
            field('状態', '<select name="status">' + opts([['draft', '下書き'], ['issued', '発行済'], ['paid', '入金済']], inv.status) + '</select>') +
          '</div></section>' +

          '<section class="card"><h2 class="card-title">明細</h2><div id="items"></div></section>' +

          '<section class="card"><h2 class="card-title">備考</h2>' +
            textarea('notes', inv.notes, 4) +
          '</section>' +
        '</div>' +

        '<aside class="editor-side">' +
          '<div class="card sticky">' +
            '<label class="switch"><input type="checkbox" name="withholding"' + (inv.withholding ? ' checked' : '') + '><span class="switch-ui"></span><span>源泉徴収する</span></label>' +
            '<div id="totals"></div>' +
            '<div class="side-actions">' +
              '<button type="submit" class="btn btn-primary btn-block">保存</button>' +
              '<button type="button" class="btn btn-block" data-act="pdf">PDFダウンロード</button>' +
              '<button type="button" class="btn btn-ghost btn-block" data-act="preview">プレビュー</button>' +
            '</div>' +
            '<div class="side-sep"><button type="button" class="btn btn-block" data-act="est">見積書を作成（2週間前）</button>' +
              (inv.estimate ? '<p class="hint est-note">保存済みの見積：' + esc(inv.estimate.number) + '（' + esc(fmtDate(inv.estimate.issueDate)) + '）</p>' : '') + '</div>' +
            (isNew ? '' : '<button type="button" class="link-danger" data-act="del">この請求書を削除</button>') +
          '</div>' +
        '</aside>' +
        '<div class="mobile-bar"><span class="mobile-bar-total"><span>ご請求金額</span><b id="mb-total"></b></span><button type="submit" class="btn btn-primary">保存</button></div>' +
      '</form>';

    var form = document.getElementById('inv-form');
    var totals = document.getElementById('totals');
    function updTotals() { totals.innerHTML = totalsHTML(inv); document.getElementById('mb-total').textContent = yen(summarize(inv).billed); }
    bindItems(document.getElementById('items'), inv.items, updTotals);

    form.addEventListener('input', function (e) {
      var n = e.target.name; if (!n || e.target.closest('#items')) return;
      if (n.indexOf('snap.') === 0) { inv.clientSnapshot[n.slice(5)] = e.target.value; return; }
      if (n === 'withholding') { inv.withholding = e.target.checked; updTotals(); return; }
      if (n === 'clientId') {
        inv.clientId = e.target.value;
        var c = findClient(inv.clientId);
        if (c) {
          inv.clientSnapshot = snapshotOf(c);
          ['name', 'honorific', 'postal', 'contactName', 'address'].forEach(function (k) {
            form.elements['snap.' + k].value = inv.clientSnapshot[k] || '';
          });
        }
        return;
      }
      inv[n] = e.target.value;
      if (n === 'issueDate' && !inv.number) form.elements.number.placeholder = '自動：' + Store.peekNumber(inv.issueDate || today(), state);
    });

    function commit() {
      if (!inv.clientSnapshot.name.trim()) {
        toast('宛名を入力してください', true);
        form.elements['snap.name'].focus();
        return null;
      }
      if (!inv.issueDate) { toast('請求日を入力してください', true); form.elements.issueDate.focus(); return null; }
      inv.items.forEach(function (it) { it.quantity = num(it.quantity); it.unitPrice = num(it.unitPrice); it.taxRate = num(it.taxRate); });
      if (!inv.number.trim()) inv.number = Store.nextNumber(inv.issueDate, state);
      inv.updatedAt = nowISO();
      if (!inv.id) {
        inv.id = Store.uuid(); inv.createdAt = inv.updatedAt;
        state.invoices.push(inv);
      } else {
        var idx = state.invoices.findIndex(function (x) { return x.id === inv.id; });
        if (idx === -1) state.invoices.push(inv); else state.invoices[idx] = inv;
      }
      save();
      var saved = inv;
      inv = clone(inv);
      return saved;
    }

    form.onsubmit = function (e) {
      e.preventDefault();
      var wasNew = isNew;
      var saved = commit(); if (!saved) return;
      toast('保存しました');
      if (wasNew) { history.replaceState(null, '', '#/invoices/' + saved.id); renderInvoiceEdit(saved.id); }
      else form.elements.number.value = saved.number;
    };
    $('[data-act=pdf]', form).onclick = function () {
      var saved = commit(); if (!saved) return;
      pdfDownload(saved).then(afterAutoSave(saved));
    };
    $('[data-act=preview]', form).onclick = function () {
      var saved = commit(); if (!saved) return;
      pdfPreview(saved).then(afterAutoSave(saved));
    };
    $('[data-act=est]', form).onclick = function () {
      var wasNew = isNew;
      var saved = commit(); if (!saved) return;
      openEstimateDialog(saved, function (s2) {
        if (wasNew) { history.replaceState(null, '', '#/invoices/' + s2.id); }
        inv.estimate = clone(s2.estimate);
        setTimeout(function () { if (!document.getElementById('estimate').hidden) return; renderInvoiceEdit(s2.id); }, 0);
      });
    };
    function afterAutoSave(saved) {
      return function () {
        if (isNew) { history.replaceState(null, '', '#/invoices/' + saved.id); renderInvoiceEdit(saved.id); }
        else form.elements.number.value = saved.number;
      };
    }
    var del = $('[data-act=del]', form);
    if (del) del.onclick = function () {
      if (!confirm('この請求書を削除します。よろしいですか？')) return;
      state.invoices = state.invoices.filter(function (x) { return x.id !== inv.id; });
      save(); toast('削除しました'); go('#/invoices');
    };
  }

  function notFound(what, back) {
    return '<div class="empty"><p class="empty-title">' + esc(what) + 'が見つかりません</p><a class="btn" href="' + back + '">戻る</a></div>';
  }

  /* ---------- 取引先 ---------- */

  function renderClients() {
    var list = state.clients.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ja'); });
    var html = pageHead('取引先', list.length ? list.length + ' 件' : '', '<a class="btn btn-primary" href="#/clients/new">＋ 取引先を追加</a>');
    if (!list.length) {
      html += '<div class="empty"><p class="empty-title">取引先はまだありません</p><p>よく請求する相手を登録しておくと、請求書で選ぶだけで宛先が入ります。</p><a class="btn btn-primary" href="#/clients/new">＋ 取引先を追加</a></div>';
    } else {
      html += '<ul class="cards">';
      list.forEach(function (c) {
        var n = state.invoices.filter(function (i) { return i.clientId === c.id; }).length;
        html += '<li><a class="client-card" href="#/clients/' + esc(c.id) + '">' +
          '<span class="client-card-name">' + esc(c.name) + ' <span class="muted">' + esc(c.honorific) + '</span></span>' +
          '<span class="client-card-meta">' + (c.contactName ? esc(c.contactName) + '<br>' : '') +
          (c.address ? esc(c.address.split('\n')[0]) : '<span class="muted">住所未登録</span>') + '</span>' +
          '<span class="client-card-foot">請求書 ' + n + ' 件</span></a></li>';
      });
      html += '</ul>';
    }
    app.innerHTML = html;
  }

  function renderClientEdit(id) {
    var existing = id !== 'new' ? findClient(id) : null;
    if (id !== 'new' && !existing) { app.innerHTML = notFound('取引先', '#/clients'); return; }
    var c = existing ? clone(existing) : { id: '', name: '', honorific: '御中', postal: '', address: '', contactName: '', email: '', memo: '' };
    app.innerHTML = pageHead(existing ? '取引先の編集' : '取引先を追加', '<a href="#/clients" class="back">← 取引先一覧へ</a>') +
      '<form id="client-form" class="narrow-form card" autocomplete="off" novalidate><div class="grid">' +
        field('名前', input('name', c.name, 'placeholder="株式会社〇〇"'), { req: true }) +
        field('敬称', '<select name="honorific">' + opts([['御中', '御中（会社・団体）'], ['様', '様（個人）']], c.honorific) + '</select>', { cls: 'narrow' }) +
        field('郵便番号', input('postal', c.postal, 'placeholder="100-0001" inputmode="numeric"'), { cls: 'narrow' }) +
        field('ご担当者', input('contactName', c.contactName, 'placeholder="山田 太郎 様"')) +
        field('住所', textarea('address', c.address, 2), { cls: 'span-2' }) +
        field('メール', input('email', c.email, 'type="email" placeholder="name@example.com"'), { cls: 'span-2' }) +
        field('メモ', textarea('memo', c.memo, 3), { cls: 'span-2', hint: '請求書には載りません' }) +
      '</div><div class="form-actions">' +
        (existing ? '<button type="button" class="link-danger" data-act="del">削除</button>' : '<span></span>') +
        '<div class="form-actions-r"><a class="btn btn-ghost" href="#/clients">キャンセル</a><button type="submit" class="btn btn-primary">保存</button></div>' +
      '</div></form>';

    var form = document.getElementById('client-form');
    form.onsubmit = function (e) {
      e.preventDefault();
      ['name', 'honorific', 'postal', 'address', 'contactName', 'email', 'memo'].forEach(function (k) { c[k] = form.elements[k].value; });
      c.name = c.name.trim();
      if (!c.name) { toast('名前を入力してください', true); form.elements.name.focus(); return; }
      if (!c.id) { c.id = Store.uuid(); state.clients.push(c); }
      else state.clients = state.clients.map(function (x) { return x.id === c.id ? c : x; });
      save(); toast('保存しました'); go('#/clients');
    };
    var del = $('[data-act=del]', form);
    if (del) del.onclick = function () {
      var recs = state.recurring.filter(function (r) { return r.template.clientId === c.id; }).length;
      var msg = '取引先「' + c.name + '」を削除します。作成済みの請求書の宛先はそのまま残ります。' +
        (recs ? '\nこの取引先を使う定期請求が ' + recs + ' 件あります（宛先が空になります）。' : '') + '\nよろしいですか？';
      if (!confirm(msg)) return;
      state.clients = state.clients.filter(function (x) { return x.id !== c.id; });
      save(); toast('削除しました'); go('#/clients');
    };
  }

  /* ---------- 定期請求 ---------- */

  function intervalLabel(n) {
    n = +n;
    return ({ 1: '毎月', 2: '2か月ごと', 3: '3か月ごと', 6: '半年ごと', 12: '毎年' })[n] || n + 'か月ごと';
  }
  function dayLabel(d) { d = +d; return d === 0 || d >= 31 ? '月末' : d + '日'; }

  function renderRecurringList() {
    var list = state.recurring;
    var html = pageHead('定期請求', '決まった日に請求書を自動で作ります（アプリを開いたときに作成）', '<a class="btn btn-primary" href="#/recurring/new">＋ 定期請求を追加</a>');
    if (!list.length) {
      html += '<div class="empty"><p class="empty-title">定期請求はまだありません</p><p>月額の保守費や顧問料など、毎回同じ内容の請求を登録できます。</p><a class="btn btn-primary" href="#/recurring/new">＋ 定期請求を追加</a></div>';
      app.innerHTML = html; return;
    }
    html += '<table class="table rec-table"><thead><tr><th>名前</th><th>取引先</th><th>周期</th><th>次回</th><th class="num">ご請求金額</th><th>有効</th></tr></thead><tbody>';
    list.forEach(function (r) {
      var c = findClient(r.template.clientId);
      var s = summarize({ items: r.template.items, withholding: r.template.withholding });
      var next = Recurring.preview(r, 1)[0];
      html += '<tr data-id="' + esc(r.id) + '"' + (r.active ? '' : ' class="inactive"') + '>' +
        '<td class="cell-main"><a class="row-link" href="#/recurring/' + esc(r.id) + '"><span class="client-name">' + esc(r.name || '無題') + '</span></a></td>' +
        '<td data-label="取引先">' + (c ? esc(c.name) : '<span class="muted">未設定</span>') + '</td>' +
        '<td data-label="周期">' + esc(intervalLabel(r.intervalMonths)) + ' ' + esc(dayLabel(r.issueDay)) + '</td>' +
        '<td data-label="次回" class="nowrap">' + (r.active && next ? esc(fmtDate(next)) : '<span class="muted">' + (next ? '停止中' : '終了') + '</span>') + '</td>' +
        '<td data-label="金額" class="num strong">' + yen(s.billed) + '</td>' +
        '<td data-label="有効"><label class="switch"><input type="checkbox" data-act="active"' + (r.active ? ' checked' : '') + ' aria-label="有効"><span class="switch-ui"></span></label></td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    app.innerHTML = html;
    $$('tr[data-id]', app).forEach(function (tr) {
      var r = findRec(tr.dataset.id);
      $('[data-act=active]', tr).onchange = function (e) {
        r.active = e.target.checked;
        if (r.active) syncNextIssue(r);
        save();
        if (r.active) runRecurring();
        toast(r.active ? '有効にしました' : '停止しました');
        renderRecurringList();
      };
    });
  }

  // スケジュール変更時に nextIssueDate を決め直す（作成済みの回は飛ばす）
  function syncNextIssue(r) {
    var d = Recurring.computeFirstIssueDate(r);
    var last = '';
    state.invoices.forEach(function (i) { if (i.recurringId === r.id && i.issueDate > last) last = i.issueDate; });
    var guard = 0;
    while (last && d <= last && guard++ < 600) d = Recurring.nextAfter(r, d);
    r.nextIssueDate = d;
  }

  function renderRecurringEdit(id) {
    var existing = id !== 'new' ? findRec(id) : null;
    if (id !== 'new' && !existing) { app.innerHTML = notFound('定期請求', '#/recurring'); return; }
    var t0 = today();
    var r = existing ? clone(existing) : {
      id: '', name: '', active: true,
      template: { clientId: '', title: '', items: [newItem()], withholding: false, notes: state.settings.defaultNotes || '' },
      intervalMonths: 1, issueDay: 25, dueRule: { monthsAfter: 1, day: 0 },
      startDate: t0, endDate: '', nextIssueDate: '', titleTemplate: '{ym}分 ', autoStatus: 'draft'
    };
    var made = existing ? state.invoices.filter(function (i) { return i.recurringId === r.id; }).length : 0;
    var dayOpts = [[0, '月末']];
    for (var d = 1; d <= 28; d++) dayOpts.push([d, d + '日']);
    var issueDayVal = (+r.issueDay >= 29 ? 0 : +r.issueDay);
    var dueDayVal = (+r.dueRule.day >= 29 ? 0 : +r.dueRule.day);

    app.innerHTML = pageHead(existing ? '定期請求の編集' : '定期請求を追加',
        '<a href="#/recurring" class="back">← 定期請求一覧へ</a>' + (made ? '<span class="dot">・</span>これまでに ' + made + ' 件作成' : '')) +
      '<form id="rec-form" class="editor" autocomplete="off" novalidate>' +
        '<div class="editor-main">' +
          '<section class="card"><h2 class="card-title">内容</h2><div class="grid">' +
            field('管理用の名前', input('name', r.name, 'placeholder="〇〇社 月額保守"'), { cls: 'span-2', req: true, hint: '請求書には載りません' }) +
            field('取引先', '<select name="clientId">' + clientOptions(r.template.clientId) + '</select>', { cls: 'span-2', req: true }) +
            field('件名', input('titleTemplate', r.titleTemplate || r.template.title, 'placeholder="{YYYY}年{M}月分 保守費用"'), { cls: 'span-2',
              hint: '<span class="title-sample">次回の件名：<b id="title-sample">—</b></span>' }) +
          '</div></section>' +
          '<section class="card"><h2 class="card-title">明細</h2><div id="items"></div></section>' +
          '<section class="card"><h2 class="card-title">備考</h2>' + textarea('notes', r.template.notes, 3) + '</section>' +
          '<section class="card"><h2 class="card-title">スケジュール</h2><div class="grid">' +
            field('周期', '<select name="intervalMonths">' + opts([[1, '毎月'], [2, '2か月ごと'], [3, '3か月ごと（四半期）'], [6, '半年ごと'], [12, '毎年']], r.intervalMonths) + '</select>') +
            field('発行日', '<select name="issueDay">' + opts(dayOpts, issueDayVal) + '</select>') +
            field('お支払期限', '<div class="inline"><select name="dueMonths">' + opts([[0, '当月'], [1, '翌月'], [2, '翌々月'], [3, '3か月後']], r.dueRule.monthsAfter) + '</select>' +
              '<select name="dueDay">' + opts(dayOpts, dueDayVal) + '</select></div>', { cls: 'span-2' }) +
            field('開始日', input('startDate', r.startDate, 'type="date"'), { hint: 'この日以降の最初の発行日から' }) +
            field('終了日', input('endDate', r.endDate, 'type="date"'), { hint: '空欄なら無期限' }) +
            field('作成時の状態', '<select name="autoStatus">' + opts([['draft', '下書き（確認してから発行）'], ['issued', '発行済']], r.autoStatus) + '</select>', { cls: 'span-2' }) +
          '</div></section>' +
        '</div>' +
        '<aside class="editor-side"><div class="card sticky">' +
          '<label class="switch"><input type="checkbox" name="active"' + (r.active ? ' checked' : '') + '><span class="switch-ui"></span><span>有効</span></label>' +
          '<label class="switch"><input type="checkbox" name="withholding"' + (r.template.withholding ? ' checked' : '') + '><span class="switch-ui"></span><span>源泉徴収する</span></label>' +
          '<div id="totals"></div>' +
          '<div class="schedule"><h3>今後の発行予定</h3><ol id="preview-dates"></ol><p class="hint warn-text" id="past-note"></p></div>' +
          '<details class="tokens" open><summary>差し込みできる文字</summary>' +
            '<p class="hint">件名・品目名・備考で使えます。基準は発行日の月です。</p>' +
            '<dl>' +
              '<div><dt><code>{ym}</code></dt><dd id="tk-ym"></dd></div>' +
              '<div><dt><code>{ym-1}</code></dt><dd id="tk-ym1"></dd></div>' +
              '<div><dt><code>{year}</code></dt><dd id="tk-year"></dd></div>' +
              '<div><dt><code>{month}</code></dt><dd id="tk-month"></dd></div>' +
              '<div><dt><code>{month-1}</code></dt><dd id="tk-month1"></dd></div>' +
              '<div><dt><code>{MM}</code></dt><dd id="tk-mm"></dd></div>' +
              '<div><dt><code>{lastday}</code></dt><dd id="tk-last"></dd></div>' +
              '<div><dt><code>{date}</code></dt><dd id="tk-date"></dd></div>' +
            '</dl><p class="hint">前月分の請求は <code>{ym-1}分</code> のように書きます。<code>+1</code> で翌月。</p></details>' +
          '<div class="side-actions">' +
            '<button type="submit" class="btn btn-primary btn-block">保存</button>' +
            (existing ? '<button type="button" class="btn btn-block" data-act="now">今すぐ1件作成</button>' : '') +
          '</div>' +
          (existing ? '<button type="button" class="link-danger" data-act="del">この定期請求を削除</button>' : '') +
        '</div></aside>' +
      '</form>';

    var form = document.getElementById('rec-form');
    var totals = document.getElementById('totals');
    function readSchedule() {
      r.intervalMonths = +form.elements.intervalMonths.value;
      r.issueDay = +form.elements.issueDay.value;
      r.dueRule = { monthsAfter: +form.elements.dueMonths.value, day: +form.elements.dueDay.value };
      r.startDate = form.elements.startDate.value;
      r.endDate = form.elements.endDate.value;
    }
    function scheduleKey(x) { return [x.intervalMonths, x.issueDay, x.startDate].join('|'); }
    var origKey = existing ? scheduleKey(existing) : '';
    function updSide() {
      totals.innerHTML = totalsHTML({ items: r.template.items, withholding: r.template.withholding });
      var tmp = clone(r);
      if (!existing || scheduleKey(tmp) !== origKey || !tmp.nextIssueDate) {
        syncNextIssue(tmp);
      }
      var dates = r.startDate ? Recurring.preview(tmp, 6) : [];
      document.getElementById('preview-dates').innerHTML = dates.length ? dates.map(function (d) {
        var past = d <= t0;
        return '<li' + (past ? ' class="past"' : '') + '><span>' + esc(fmtDateW(d)) + '</span><span class="muted">期限 ' + esc(fmtDate(Recurring.dueDateFor(tmp, d)).slice(5)) + '</span></li>';
      }).join('') : '<li class="muted">予定はありません</li>';
      var pastN = dates.filter(function (d) { return d <= t0; }).length;
      document.getElementById('past-note').textContent = r.active && pastN ? '色付きの ' + pastN + ' 件は今日以前のため、保存するとすぐ作成されます' : '';
      var base = dates[0] || r.startDate || t0;
      var F = function (x) { return Recurring.fillTemplate(x, base); };
      document.getElementById('title-sample').textContent = F(form.elements.titleTemplate.value) || '—';
      [['tk-ym', '{ym}'], ['tk-ym1', '{ym-1}'], ['tk-year', '{year}'], ['tk-month', '{month}'], ['tk-month1', '{month-1}'], ['tk-mm', '{MM}'], ['tk-last', '{lastday}'], ['tk-date', '{date}']]
        .forEach(function (p) { document.getElementById(p[0]).textContent = '→ ' + F(p[1]); });
    }
    bindItems(document.getElementById('items'), r.template.items, updSide);

    form.addEventListener('input', function (e) {
      var n = e.target.name; if (!n || e.target.closest('#items')) return;
      if (n === 'name') r.name = e.target.value;
      else if (n === 'clientId') r.template.clientId = e.target.value;
      else if (n === 'titleTemplate') r.titleTemplate = e.target.value;
      else if (n === 'notes') r.template.notes = e.target.value;
      else if (n === 'withholding') r.template.withholding = e.target.checked;
      else if (n === 'active') r.active = e.target.checked;
      else if (n === 'autoStatus') r.autoStatus = e.target.value;
      else readSchedule();
      updSide();
    });

    function commit() {
      readSchedule();
      r.name = r.name.trim();
      if (!r.name) { toast('管理用の名前を入力してください', true); form.elements.name.focus(); return null; }
      if (!r.template.clientId) { toast('取引先を選んでください', true); form.elements.clientId.focus(); return null; }
      if (!r.startDate) { toast('開始日を入力してください', true); form.elements.startDate.focus(); return null; }
      r.template.title = r.titleTemplate;
      r.template.items.forEach(function (it) { it.quantity = num(it.quantity); it.unitPrice = num(it.unitPrice); it.taxRate = num(it.taxRate); });
      if (!existing || scheduleKey(r) !== origKey || !r.nextIssueDate) syncNextIssue(r);
      if (!r.id) { r.id = Store.uuid(); state.recurring.push(r); }
      else state.recurring = state.recurring.map(function (x) { return x.id === r.id ? r : x; });
      save();
      return r;
    }

    form.onsubmit = function (e) {
      e.preventDefault();
      var saved = commit(); if (!saved) return;
      var created = runRecurring();
      toast(created.length ? '保存しました（' + created.length + ' 件作成）' : '保存しました');
      go('#/recurring');
    };
    var now = $('[data-act=now]', form);
    if (now) now.onclick = function () {
      var saved = commit(); if (!saved) return;
      var inv = Recurring.buildInvoice(state, saved, today());
      state.invoices.push(inv);
      save();
      toast('請求書を作成しました');
      go('#/invoices/' + inv.id);
    };
    var del = $('[data-act=del]', form);
    if (del) del.onclick = function () {
      if (!confirm('定期請求「' + (r.name || '') + '」を削除します。作成済みの請求書は残ります。よろしいですか？')) return;
      state.recurring = state.recurring.filter(function (x) { return x.id !== r.id; });
      save(); toast('削除しました'); go('#/recurring');
    };
  }

  /* ---------- 設定 ---------- */

  function toHalfWidth(s) {
    return String(s || '').replace(/[０-９Ａ-Ｚａ-ｚ]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); });
  }
  function regWarning(v) {
    v = toHalfWidth(v).trim();
    if (!v) return '';
    return /^T\d{13}$/.test(v) ? '' : '「T」と13桁の数字の形式で入力してください（例：T1234567890123）';
  }

  function renderSettings() {
    var s = clone(state.settings);
    var is = s.issuer;
    app.innerHTML = pageHead('設定', '請求書に載る自分の情報と、作成時の初期値') +
      '<form id="settings-form" class="settings" autocomplete="off" novalidate>' +
      '<section class="card"><h2 class="card-title">請求元（自分）</h2><div class="grid">' +
        field('屋号・氏名', input('issuer.name', is.name, 'placeholder="chibi-ism デザイン事務所"'), { cls: 'span-2' }) +
        field('郵便番号', input('issuer.postal', is.postal, 'placeholder="150-0001" inputmode="numeric"'), { cls: 'narrow' }) +
        field('電話番号', input('issuer.tel', is.tel, 'type="tel"')) +
        field('住所', textarea('issuer.address', is.address, 2), { cls: 'span-2' }) +
        field('メール', input('issuer.email', is.email, 'type="email"'), { cls: 'span-2' }) +
        field('登録番号（適格請求書発行事業者）', input('issuer.registrationNumber', is.registrationNumber, 'placeholder="T1234567890123"'), { cls: 'span-2', hint: '<span id="reg-warn" class="warn-text"></span>' }) +
        field('お振込先', textarea('issuer.bank', is.bank, 3), { cls: 'span-2', hint: '例：〇〇銀行 〇〇支店 普通 1234567 カ）チビイズム' }) +
      '</div>' +
        '<div class="seal-row"><div class="seal-preview" id="seal-preview"></div><div>' +
          '<span class="label">角印</span><p class="hint">PNG（背景透過）か JPEG。請求元の右に重ねて印字します。</p>' +
          '<div class="inline"><label class="btn btn-sm">画像を選ぶ<input type="file" accept="image/png,image/jpeg" id="seal-file" hidden></label>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="seal-clear">外す</button></div>' +
        '</div></div>' +
      '</section>' +

      '<section class="card"><h2 class="card-title">請求書の初期値</h2><div class="grid">' +
        field('請求書番号の書式', input('numberFormat', s.numberFormat), { hint: '<code>{YYYY}</code><code>{MM}</code><code>{DD}</code> 請求日 ・ <code>{SEQ}</code><code>{SEQ3}</code><code>{SEQ4}</code> 連番（桁ぞろえ）<br>次の番号：<b id="num-sample"></b>', cls: 'span-2' }) +
        field('次の連番', input('nextSeq', s.nextSeq, 'type="number" min="1" step="1" inputmode="numeric"'), { cls: 'narrow' }) +
        field('消費税の端数処理', '<select name="rounding">' + opts([['floor', '切り捨て'], ['round', '四捨五入'], ['ceil', '切り上げ']], s.rounding) + '</select>', { hint: '税率ごとに1回だけ処理します' }) +
        field('既定の税率', '<select name="defaultTaxRate">' + opts(TAX_OPTS, s.defaultTaxRate) + '</select>') +
        field('備考の初期値', textarea('defaultNotes', s.defaultNotes, 3), { cls: 'span-2' }) +
      '</div></section>' +

      '<div class="form-actions sticky-bottom"><span class="hint">' + (remote() ? 'サーバーに保存され、どの端末からも使えます' : 'ブラウザ内にだけ保存されます') + '</span><button type="submit" class="btn btn-primary">保存</button></div>' +
      '</form>' +

      '<section class="card"><h2 class="card-title">バックアップ</h2>' +
        '<p class="hint">' + (remote() ? 'サーバーには日ごとの控えも残りますが、念のため手元にも書き出しておくと安心です。' : 'データはこのブラウザの中だけにあります。ときどき書き出して保管してください。') + '</p>' +
        '<div class="inline"><button type="button" class="btn" id="export">JSON を書き出す</button>' +
        '<label class="btn btn-ghost">JSON を読み込む<input type="file" accept="application/json,.json" id="import" hidden></label></div>' +
        '<p class="hint">請求書 ' + state.invoices.length + ' 件 ・ 取引先 ' + state.clients.length + ' 件 ・ 定期請求 ' + state.recurring.length + ' 件</p>' +
      '</section>' +
      (remote() ?
      '<section class="card"><h2 class="card-title">同期とサーバーの控え</h2>' +
        '<p class="hint">その日に最初に変更する直前の内容を、1日1つサーバーに残しています（90日間）。</p>' +
        '<div id="snapshots" class="snapshots"><span class="muted">読み込み中…</span></div>' +
        '<div class="inline"><button type="button" class="btn btn-ghost btn-sm" id="logout">この端末からログアウト</button></div>' +
      '</section>' : '');

    var form = document.getElementById('settings-form');
    function drawSeal() {
      document.getElementById('seal-preview').innerHTML = is.sealDataUrl
        ? '<img alt="角印" src="' + esc(is.sealDataUrl) + '">' : '<span class="muted">未設定</span>';
      document.getElementById('seal-clear').hidden = !is.sealDataUrl;
    }
    function updSamples() {
      document.getElementById('num-sample').textContent = Store.formatNumber(form.elements.numberFormat.value, today(), Math.max(1, parseInt(form.elements.nextSeq.value, 10) || 1));
      document.getElementById('reg-warn').textContent = regWarning(form.elements['issuer.registrationNumber'].value);
    }
    drawSeal(); updSamples();
    form.addEventListener('input', updSamples);
    form.elements['issuer.registrationNumber'].addEventListener('blur', function (e) {
      e.target.value = toHalfWidth(e.target.value).replace(/\s|-/g, '').toUpperCase(); updSamples();
    });

    document.getElementById('seal-file').onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      if (!/^image\/(png|jpeg)$/.test(f.type)) { toast('PNG か JPEG を選んでください', true); return; }
      readSeal(f).then(function (url) { is.sealDataUrl = url; drawSeal(); toast('角印を読み込みました（保存で確定）'); })
        .catch(function () { toast('画像を読み込めませんでした', true); });
      e.target.value = '';
    };
    document.getElementById('seal-clear').onclick = function () { is.sealDataUrl = ''; drawSeal(); };

    form.onsubmit = function (e) {
      e.preventDefault();
      ['name', 'postal', 'address', 'tel', 'email', 'bank'].forEach(function (k) { is[k] = form.elements['issuer.' + k].value; });
      is.registrationNumber = toHalfWidth(form.elements['issuer.registrationNumber'].value).replace(/\s|-/g, '').toUpperCase();
      s.numberFormat = form.elements.numberFormat.value.trim() || '{YYYY}{MM}-{SEQ3}';
      s.nextSeq = Math.max(1, parseInt(form.elements.nextSeq.value, 10) || 1);
      s.rounding = form.elements.rounding.value;
      s.defaultTaxRate = +form.elements.defaultTaxRate.value;
      s.defaultNotes = form.elements.defaultNotes.value;
      state.settings = s;
      save();
      var w = regWarning(is.registrationNumber);
      toast(w ? '保存しました（登録番号の形式を確認してください）' : '保存しました', !!w);
      renderSettings();
    };

    document.getElementById('export').onclick = function () { Store.exportJSON(state); toast('書き出しました'); };
    if (remote()) {
      Sync.snapshots().then(function (dates) {
        var box = document.getElementById('snapshots'); if (!box) return;
        box.innerHTML = dates.length ? dates.map(function (d) {
          return '<div class="snap-row"><span>' + esc(fmtDateJa(d)) + ' の最初の変更より前</span>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-snap-dl="' + esc(d) + '">書き出す</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-snap-restore="' + esc(d) + '">この内容に戻す</button></div>';
        }).join('') : '<span class="muted">まだありません（データを変更した日から残ります）</span>';
        $$('[data-snap-dl]', box).forEach(function (b) {
          b.onclick = function () {
            Sync.snapshot(b.dataset.snapDl).then(function (st) { Store.exportJSON(st); })
              .catch(function (err) { toast(err.message, true); });
          };
        });
        $$('[data-snap-restore]', box).forEach(function (b) {
          b.onclick = function () {
            var d = b.dataset.snapRestore;
            if (!confirm(fmtDateJa(d) + ' の最初の変更より前の内容に戻します。\nいまの内容は念のため JSON で書き出してから戻します。よろしいですか？')) return;
            Sync.snapshot(d).then(function (st) {
              Store.exportJSON(state);
              state = Store.normalize(st); save(); toast('戻しました（いまの内容は書き出し済み）'); renderSettings();
            }).catch(function (err) { toast(err.message, true); });
          };
        });
      }).catch(function () {
        var box = document.getElementById('snapshots'); if (box) box.innerHTML = '<span class="muted">控えを取得できませんでした</span>';
      });
      document.getElementById('logout').onclick = function () {
        if (!confirm('この端末からログアウトします。データはサーバーに残ります。')) return;
        Sync.logout();
        try { localStorage.removeItem(Store.KEY); } catch (e) { /* noop */ }
        location.hash = '#/invoices';
        location.reload();
      };
    }
    document.getElementById('import').onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      Store.importJSON(f).then(function (st) {
        if (!st) return;
        state = st;
        toast('読み込みました');
        runRecurring();
        renderSettings();
      }).catch(function (err) { toast(err.message || '読み込めませんでした', true); });
      e.target.value = '';
    };
  }

  // 大きすぎる画像は縮小（localStorage を圧迫しないように）
  function readSeal(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = reject;
      r.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var max = 480, w = img.naturalWidth, h = img.naturalHeight;
          if (w <= max && h <= max && r.result.length < 300000) { resolve(r.result); return; }
          var k = Math.min(1, max / Math.max(w, h));
          var cv = document.createElement('canvas');
          cv.width = Math.round(w * k); cv.height = Math.round(h * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          resolve(file.type === 'image/jpeg' ? cv.toDataURL('image/jpeg', 0.9) : cv.toDataURL('image/png'));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  /* ---------- ルーティング ---------- */

  function render() {
    var parts = (location.hash || '#/invoices').replace(/^#\/?/, '').split('/');
    var section = parts[0] || 'invoices', id = parts[1];
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('active', a.dataset.nav === section); });
    if (section === 'invoices') id ? renderInvoiceEdit(id) : renderInvoices();
    else if (section === 'clients') id ? renderClientEdit(id) : renderClients();
    else if (section === 'recurring') id ? renderRecurringEdit(id) : renderRecurringList();
    else if (section === 'settings') renderSettings();
    else { location.hash = '#/invoices'; return; }
    var titles = { invoices: '請求書', clients: '取引先', recurring: '定期請求', settings: '設定' };
    document.title = (titles[section] || '請求書') + ' — seikyu';
    window.scrollTo(0, 0);
  }

  var SYNC_LABEL = { synced: '同期済み', saving: '保存中…', offline: 'オフライン・未送信', error: '同期エラー（押して再試行）' };
  function drawSync(st) {
    var b = document.getElementById('sync');
    if (!remote()) { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = SYNC_LABEL[st] || '';
    b.className = 'sync sync-' + st;
    b.title = st === 'offline' || st === 'error' ? '押すと送り直します' : '';
  }

  function editing() { return /^#\/(invoices|clients|recurring)\/./.test(location.hash); }

  function adopt(st) {
    state = Store.normalize(st);
    Store.saveLocal(state);
  }

  function renderLogin(msg) {
    document.querySelector('.nav').hidden = true;
    app.innerHTML = '<div class="login card"><h1 class="login-title">seikyu</h1>' +
      '<p class="hint">パスワードを入力してください</p>' +
      '<form id="login-form"><input type="password" name="pw" autocomplete="current-password" required autofocus>' +
      '<button type="submit" class="btn btn-primary">ログイン</button></form>' +
      '<p class="warn-text" id="login-msg">' + esc(msg || '') + '</p></div>';
    var f = document.getElementById('login-form');
    f.onsubmit = function (e) {
      e.preventDefault();
      var btn = $('button', f); btn.disabled = true;
      Sync.login(f.elements.pw.value).then(function (ok) {
        if (ok) { start(); return; }
        btn.disabled = false;
        document.getElementById('login-msg').textContent = 'パスワードが違います';
        f.elements.pw.select();
      }).catch(function (err) {
        btn.disabled = false;
        document.getElementById('login-msg').textContent = err.message;
      });
    };
  }

  var started = false;
  function start() {
    state = Store.load();
    app.innerHTML = '<div class="empty"><p class="muted">読み込み中…</p></div>';
    Sync.init(state).then(function (res) {
      if (res.mode === 'login') { renderLogin(); return; }
      document.querySelector('.nav').hidden = false;
      if (res.state) adopt(res.state);
      Store.state = state;
      drawSync(Sync.status);
      runRecurring();
      if (!started) {
        started = true;
        window.addEventListener('hashchange', render);
        // 別タブで変更されたら読み直す（編集中の画面は保たない：一覧系だけ再描画）
        window.addEventListener('storage', function (e) {
          if (e.key !== Store.KEY) return;
          state = Store.load();
          if (!editing()) render();
        });
        // 別の端末での変更を取り込む
        document.addEventListener('visibilitychange', function () { if (!document.hidden) Sync.pull(); });
        window.addEventListener('online', function () { Sync.retry(); });
        document.getElementById('sync').onclick = function () { Sync.retry(); };
      }
      if (res.error) toast(res.error, true);
      render();
    });
  }

  function init() {
    if (!Sync) { Sync = { mode: 'local' }; state = Store.load(); runRecurring(); window.addEventListener('hashchange', render); render(); return; }
    Sync.onStatus = drawSync;
    Sync.onLogin = function () { renderLogin('ログインし直してください'); };
    Sync.onReplace = function (st, why) {
      adopt(st);
      runRecurring();
      if (editing()) showBanner(why === 'conflict' ? '最新の内容を読み込みました' : '別の端末での変更を読み込みました');
      else render();
    };
    start();
  }

  if (!Store || !Calc || !Recurring) {
    app.innerHTML = '<div class="empty"><p class="empty-title">読み込みに失敗しました</p><p>js フォルダのファイルがそろっているか確認してください。</p></div>';
    return;
  }
  init();
})();
