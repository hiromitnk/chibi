// パスワード1つだけの認証。トークンはパスワードから作る HMAC（パスワードを変えると全端末ログアウト）
const crypto = require('crypto');

function password() { return process.env.SEIKYU_PASSWORD || ''; }

function tokenFor(pw) {
  return crypto.createHmac('sha256', pw).update('seikyu-session-v1').digest('hex');
}

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// 通ればそのまま true。だめなら応答して false
function guard(req, res) {
  const kv = require('./_kv');
  if (!password() || !kv.configured()) {
    send(res, 500, { error: 'not_configured', message: 'SEIKYU_PASSWORD と Upstash Redis の環境変数を設定してください' });
    return false;
  }
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!t || !same(t, tokenFor(password()))) { send(res, 401, { error: 'unauthorized' }); return false; }
  return true;
}

module.exports = { password, tokenFor, same, send, guard };
