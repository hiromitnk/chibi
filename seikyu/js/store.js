/* seikyu — Store: localStorage の読み書き、採番、バックアップ */
(function (global) {
  'use strict';

  var KEY = 'seikyu:v1';

  function defaults() {
    return {
      version: 1,
      settings: {
        issuer: {
          name: '', postal: '', address: '', tel: '', email: '',
          registrationNumber: '', bank: '', sealDataUrl: ''
        },
        numberFormat: '{YYYY}{MM}-{SEQ3}',
        nextSeq: 1,
        defaultTaxRate: 10,
        defaultNotes: '',
        rounding: 'floor'
      },
      clients: [],
      invoices: [],
      recurring: []
    };
  }

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  // defaults を土台に、保存データの既知キーを上書き（未知キーは残す）
  function mergeDeep(base, data) {
    if (!isObj(data)) return base;
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(data).forEach(function (k) {
      var b = base[k], d = data[k];
      if (isObj(b) && isObj(d)) out[k] = mergeDeep(b, d);
      else if (Array.isArray(b)) out[k] = Array.isArray(d) ? d : b;
      else if (d !== undefined && d !== null) out[k] = d;
    });
    return out;
  }

  function normalize(data) {
    var s = mergeDeep(defaults(), data);
    s.version = 1;
    s.settings.nextSeq = Math.max(1, parseInt(s.settings.nextSeq, 10) || 1);
    s.invoices = s.invoices.filter(isObj).map(function (inv) {
      return mergeDeep({
        id: uuid(), number: '', clientId: '', clientSnapshot: { name: '', honorific: '御中', postal: '', address: '', contactName: '' },
        title: '', issueDate: '', dueDate: '', items: [], withholding: false, notes: '',
        status: 'draft', recurringId: null, createdAt: '', updatedAt: ''
      }, inv);
    });
    s.clients = s.clients.filter(isObj).map(function (c) {
      return mergeDeep({ id: uuid(), name: '', honorific: '御中', postal: '', address: '', contactName: '', email: '', memo: '' }, c);
    });
    s.recurring = s.recurring.filter(isObj).map(function (r) {
      return mergeDeep({
        id: uuid(), name: '', active: true,
        template: { clientId: '', title: '', items: [], withholding: false, notes: '' },
        intervalMonths: 1, issueDay: 25, dueRule: { monthsAfter: 1, day: 0 },
        startDate: '', endDate: '', nextIssueDate: '', titleTemplate: '', autoStatus: 'draft'
      }, r);
    });
    return s;
  }

  function uuid() {
    try {
      if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    } catch (e) { /* noop */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) return defaults();
    try { return normalize(JSON.parse(raw)); } catch (e) { return defaults(); }
  }

  function save(state) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }

  // dateStr: "YYYY-MM-DD"
  function formatNumber(fmt, dateStr, seq) {
    var p = String(dateStr || '').split('-');
    var y = p[0] || '', m = p[1] || '', d = p[2] || '';
    return String(fmt || '{YYYY}{MM}-{SEQ3}')
      .replace(/\{YYYY\}/g, y)
      .replace(/\{MM\}/g, m)
      .replace(/\{DD\}/g, d)
      .replace(/\{SEQ4\}/g, pad(seq, 4))
      .replace(/\{SEQ3\}/g, pad(seq, 3))
      .replace(/\{SEQ\}/g, String(seq));
  }

  // 番号を採って nextSeq を進める。state を渡せばそれを使う
  function nextNumber(dateStr, state) {
    var st = state || Store.state;
    var seq = Math.max(1, parseInt(st.settings.nextSeq, 10) || 1);
    st.settings.nextSeq = seq + 1;
    return formatNumber(st.settings.numberFormat, dateStr, seq);
  }

  // 進めずに次の番号を見るだけ
  function peekNumber(dateStr, state) {
    var st = state || Store.state;
    return formatNumber(st.settings.numberFormat, dateStr, Math.max(1, parseInt(st.settings.nextSeq, 10) || 1));
  }

  function localToday() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
  }

  function exportJSON(state) {
    var st = state || Store.state;
    var blob = new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'seikyu-backup-' + localToday().replace(/-/g, '') + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // file: File。確認して置き換え。Promise<state|null>
  function importJSON(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = function () { reject(new Error('ファイルを読み込めませんでした')); };
      r.onload = function () {
        var data;
        try { data = JSON.parse(r.result); } catch (e) { reject(new Error('JSON の形式が正しくありません')); return; }
        if (!isObj(data) || !isObj(data.settings)) { reject(new Error('seikyu のバックアップではないようです')); return; }
        var n = (data.invoices || []).length, c = (data.clients || []).length;
        if (!global.confirm('現在のデータを置き換えます（請求書 ' + n + ' 件・取引先 ' + c + ' 件）。よろしいですか？')) { resolve(null); return; }
        var st = normalize(data);
        Store.save(st);
        resolve(st);
      };
      r.readAsText(file);
    });
  }

  var Store = {
    KEY: KEY,
    state: null,
    defaults: defaults,
    normalize: normalize,
    load: function () { Store.state = load(); return Store.state; },
    // ブラウザに控えを書き、サーバー同期があれば送る
    save: function (state) {
      if (state) Store.state = state;
      var ok = save(Store.state);
      if (global.Sync && global.Sync.mode === 'remote') { global.Sync.push(Store.state); return true; }
      return ok;
    },
    saveLocal: function (state) { if (state) Store.state = state; return save(Store.state); },
    uuid: uuid,
    formatNumber: formatNumber,
    nextNumber: nextNumber,
    peekNumber: peekNumber,
    today: localToday,
    exportJSON: exportJSON,
    importJSON: importJSON
  };

  global.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
