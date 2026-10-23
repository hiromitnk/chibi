// Upstash Redis（REST）への薄い窓口。Vercel の Storage で Upstash を足すと環境変数が入る
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const P = 'seikyu:';
const K_STATE = P + 'state';
const K_REV = P + 'rev';
const SNAP = P + 'snap:';
const SNAP_TTL = 60 * 60 * 24 * 90; // 日ごとの控えは 90 日

function configured() { return !!(URL_ && TOKEN); }

async function cmd(args) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('KV: ' + (j.error || r.status));
  return j.result;
}

// 日本時間の YYYY-MM-DD
function jstDate() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }

async function getState() {
  const [raw, rev] = await Promise.all([cmd(['GET', K_STATE]), cmd(['GET', K_REV])]);
  return { state: raw ? JSON.parse(raw) : null, rev: parseInt(rev, 10) || 0 };
}

// rev が baseRev と同じときだけ書く。書く前の内容をその日の控えに残す（その日の最初の1回だけ）
const CAS = `
local cur = tonumber(redis.call('GET', KEYS[2]) or '0')
if cur ~= tonumber(ARGV[2]) then return {0, cur} end
local old = redis.call('GET', KEYS[1])
if old then redis.call('SET', KEYS[3], old, 'NX', 'EX', tonumber(ARGV[3])) end
redis.call('SET', KEYS[1], ARGV[1])
return {1, redis.call('INCR', KEYS[2])}
`;

async function putState(state, baseRev) {
  const res = await cmd(['EVAL', CAS, '3', K_STATE, K_REV, SNAP + jstDate(),
    JSON.stringify(state), String(baseRev), String(SNAP_TTL)]);
  return { ok: Number(res[0]) === 1, rev: Number(res[1]) };
}

async function listSnapshots() {
  let cursor = '0';
  const dates = [];
  do {
    const [next, keys] = await cmd(['SCAN', cursor, 'MATCH', SNAP + '*', 'COUNT', '200']);
    cursor = String(next);
    keys.forEach((k) => dates.push(k.slice(SNAP.length)));
  } while (cursor !== '0');
  return dates.sort().reverse();
}

async function getSnapshot(date) {
  const raw = await cmd(['GET', SNAP + date]);
  return raw ? JSON.parse(raw) : null;
}

module.exports = { configured, getState, putState, listSnapshots, getSnapshot };
