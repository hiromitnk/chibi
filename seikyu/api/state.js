const { send, guard } = require('./_auth');
const kv = require('./_kv');

const MAX = 3 * 1024 * 1024;

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    if (req.method === 'GET') {
      return send(res, 200, await kv.getState());
    }
    if (req.method === 'PUT') {
      const b = req.body || {};
      const st = b.state;
      if (!st || typeof st !== 'object' || !st.settings) return send(res, 400, { error: 'bad_state' });
      if (JSON.stringify(st).length > MAX) return send(res, 413, { error: 'too_large' });
      const r = await kv.putState(st, parseInt(b.baseRev, 10) || 0);
      if (r.ok) return send(res, 200, { rev: r.rev });
      // 他の端末が先に書いた：最新を返す
      return send(res, 409, await kv.getState());
    }
    send(res, 405, { error: 'method' });
  } catch (e) {
    send(res, 502, { error: 'kv', message: String(e.message || e) });
  }
};
