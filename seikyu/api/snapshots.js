// サーバー上の日ごとの控え。?date=YYYY-MM-DD で中身
const { send, guard } = require('./_auth');
const kv = require('./_kv');

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  try {
    const date = req.query && req.query.date;
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return send(res, 400, { error: 'bad_date' });
      const st = await kv.getSnapshot(date);
      return st ? send(res, 200, { date, state: st }) : send(res, 404, { error: 'not_found' });
    }
    send(res, 200, { dates: await kv.listSnapshots() });
  } catch (e) {
    send(res, 502, { error: 'kv', message: String(e.message || e) });
  }
};
