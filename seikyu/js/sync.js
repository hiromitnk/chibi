/* seikyu — Sync: サーバー（Vercel の api/）との同期。api が無ければこのブラウザだけで動く */
(function (global) {
  'use strict';

  var TOKEN_KEY = 'seikyu:token';
  var META_KEY = 'seikyu:sync'; // { remote: bool, rev: n, dirty: bool }

  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { /* noop */ } }
  function lsDel(k) { try { global.localStorage.removeItem(k); } catch (e) { /* noop */ } }

  function readMeta() {
    try { return JSON.parse(lsGet(META_KEY)) || {}; } catch (e) { return {}; }
  }

  var Sync = {
    mode: 'local',      // local | remote
    status: 'local',    // local | synced | saving | offline | error
    rev: 0,
    dirty: false,
    onStatus: null,     // function(status)
    onReplace: null,    // function(state, reason)  サーバーの内容に差し替えるとき
    onLogin: null       // function()  ログインし直しが必要なとき
  };

  var inflight = false, again = false, latest = null, edits = 0;

  function token() { return lsGet(TOKEN_KEY) || ''; }

  function setStatus(s) {
    Sync.status = s;
    if (Sync.onStatus) Sync.onStatus(s);
  }

  function saveMeta() {
    lsSet(META_KEY, JSON.stringify({ remote: Sync.mode === 'remote', rev: Sync.rev, dirty: Sync.dirty }));
  }

  function api(method, path, body) {
    var opt = { method: method, headers: { Authorization: 'Bearer ' + token() }, cache: 'no-store' };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    return fetch(path, opt).then(function (r) {
      var isJSON = /json/.test(r.headers.get('content-type') || '');
      return (isJSON ? r.json() : Promise.resolve(null)).catch(function () { return null; })
        .then(function (data) { return { status: r.status, json: isJSON, data: data }; });
    });
  }

  function hasData(st) {
    return !!(st && ((st.invoices || []).length || (st.clients || []).length || (st.recurring || []).length));
  }

  // 起動時。Promise<{ mode: 'local'|'remote'|'login', state? , error? }>
  // localState: ブラウザに残っている控え
  Sync.init = function (localState) {
    var meta = readMeta();
    Sync.rev = meta.rev || 0;
    Sync.dirty = !!meta.dirty;
    return api('GET', 'api/state').then(function (r) {
      if (r.status === 401) return { mode: 'login' };
      if (!r.json || r.status === 404 || r.status === 405 || r.status === 501) {
        // api の無い置き場所（python の http.server など）
        Sync.mode = 'local'; setStatus('local');
        return { mode: 'local' };
      }
      if (r.status !== 200) {
        if (meta.remote) return offline();
        return { mode: 'local', error: (r.data && r.data.message) || ('サーバーエラー ' + r.status) };
      }
      Sync.mode = 'remote';
      var server = r.data;
      if (!server.state) {
        // サーバーが空：この端末の内容を最初のデータにする
        Sync.rev = server.rev;
        if (hasData(localState)) { Sync.dirty = true; saveMeta(); Sync.push(localState); return { mode: 'remote', state: localState }; }
        Sync.rev = server.rev; Sync.dirty = false; saveMeta(); setStatus('synced');
        return { mode: 'remote', state: null };
      }
      if (meta.remote && Sync.dirty && hasData(localState)) {
        if (meta.rev === server.rev) {
          // オフライン中の変更を送る
          Sync.rev = server.rev; Sync.push(localState);
          return { mode: 'remote', state: localState };
        }
        if (!global.confirm('この端末に、まだ送っていない変更があります。\n\nOK：サーバーの最新内容を読み込む（この端末の未送信分は捨てる）\nキャンセル：この端末の内容でサーバーを上書きする')) {
          Sync.rev = server.rev; Sync.push(localState);
          return { mode: 'remote', state: localState };
        }
      }
      Sync.rev = server.rev; Sync.dirty = false; saveMeta(); setStatus('synced');
      return { mode: 'remote', state: server.state };
    }).catch(function () {
      // ネットにつながらない
      if (meta.remote) return offline();
      Sync.mode = 'local'; setStatus('local');
      return { mode: 'local' };
    });

    function offline() {
      Sync.mode = 'remote'; setStatus('offline');
      return { mode: 'remote', state: null, offline: true };
    }
  };

  Sync.login = function (password) {
    return fetch('api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: password })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 200 && d.token) { lsSet(TOKEN_KEY, d.token); return true; }
        if (r.status === 401) return false;
        throw new Error(d.message || ('サーバーエラー ' + r.status));
      });
    });
  };

  Sync.logout = function () {
    lsDel(TOKEN_KEY);
    lsDel(META_KEY);
  };

  // 保存のたびに呼ぶ。送信は1本ずつ、最後の内容だけ送る
  Sync.push = function (state) {
    if (Sync.mode !== 'remote') return;
    latest = state;
    edits++;
    Sync.dirty = true; saveMeta();
    flush();
  };

  function flush() {
    if (inflight) { again = true; return; }
    again = false;
    if (!latest || !Sync.dirty) { if (Sync.status === 'saving') setStatus('synced'); return; }
    inflight = true;
    var sentAt = edits;
    setStatus('saving');
    api('PUT', 'api/state', { state: latest, baseRev: Sync.rev }).then(function (r) {
      inflight = false;
      if (r.status === 200) {
        Sync.rev = r.data.rev;
        if (edits === sentAt) Sync.dirty = false;
        saveMeta();
        if (Sync.dirty || again) return flush();
        setStatus('synced');
        return;
      }
      if (r.status === 409) return conflict(r.data);
      if (r.status === 401) { setStatus('error'); if (Sync.onLogin) Sync.onLogin(); return; }
      setStatus('error');
    }).catch(function () {
      inflight = false;
      setStatus('offline');
    });
  }

  function conflict(server) {
    var take = global.confirm('別の端末でデータが更新されています。\n\nOK：最新の内容を読み込む（この端末での直前の変更は取り消されます）\nキャンセル：この端末の内容で上書きする');
    if (take) {
      Sync.rev = server.rev; Sync.dirty = false; latest = null; saveMeta(); setStatus('synced');
      if (Sync.onReplace) Sync.onReplace(server.state, 'conflict');
    } else {
      Sync.rev = server.rev; saveMeta();
      flush();
    }
  }

  // 画面に戻ってきたときなど。新しければ差し替える
  Sync.pull = function () {
    if (Sync.mode !== 'remote' || inflight) return Promise.resolve(false);
    if (Sync.dirty) { flush(); return Promise.resolve(false); }
    return api('GET', 'api/state').then(function (r) {
      if (r.status === 401) { if (Sync.onLogin) Sync.onLogin(); return false; }
      if (r.status !== 200 || !r.data) { setStatus('offline'); return false; }
      if (Sync.dirty || inflight) return false;
      setStatus('synced');
      if (r.data.rev !== Sync.rev && r.data.state) {
        Sync.rev = r.data.rev; saveMeta();
        if (Sync.onReplace) Sync.onReplace(r.data.state, 'pull');
        return true;
      }
      return false;
    }).catch(function () { setStatus('offline'); return false; });
  };

  Sync.retry = function () { if (Sync.dirty) flush(); else Sync.pull(); };

  Sync.snapshots = function () {
    return api('GET', 'api/snapshots').then(function (r) {
      if (r.status !== 200) throw new Error('控えを取得できませんでした');
      return r.data.dates || [];
    });
  };

  Sync.snapshot = function (date) {
    return api('GET', 'api/snapshots?date=' + encodeURIComponent(date)).then(function (r) {
      if (r.status !== 200) throw new Error('控えを取得できませんでした');
      return r.data.state;
    });
  };

  global.Sync = Sync;
})(typeof window !== 'undefined' ? window : globalThis);
