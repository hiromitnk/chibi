const { password, tokenFor, same, send } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const pw = password();
  if (!pw) return send(res, 500, { error: 'not_configured', message: 'SEIKYU_PASSWORD が設定されていません' });
  const given = (req.body && req.body.password) || '';
  if (!same(given, pw)) {
    await new Promise((r) => setTimeout(r, 800)); // 総当たりを遅くする
    return send(res, 401, { error: 'wrong_password' });
  }
  send(res, 200, { token: tokenFor(pw) });
};
