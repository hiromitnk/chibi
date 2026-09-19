import postgres from "postgres";

// Vercel は作り方によって入れる名前が違うので、よくある名前を順に見る
const CANDIDATES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "NEON_DATABASE_URL",
] as const;

const found = CANDIDATES.find((n) => (process.env[n] ?? "").trim());
// Prisma 用の URL には postgres が知らない飾りが付くことがあるので落とす
const url = found ? process.env[found]!.trim().replace(/([?&])pgbouncer=[^&]*&?/g, "$1").replace(/[?&]$/, "") : "";

/** 台帳（データベース）が繋がっているか。無ければ店は「控えを取らない」で動く */
export const hasDb = Boolean(url);

/** 台帳が見つからないときの手がかり。名前だけを見せる（中身は見せない） */
export function ledgerHints(): { checked: string[]; seen: string[] } {
  const seen = Object.keys(process.env)
    .filter((k) => /POSTGRES|DATABASE|^PG[A-Z]+$|NEON/.test(k))
    .sort();
  return { checked: [...CANDIDATES], seen };
}

let client: postgres.Sql | null = null;

export function db(): postgres.Sql {
  if (!url) throw new Error("台帳（DATABASE_URL）が設定されていません");
  // serverless なので接続は1本。pgbouncer 越しでも動くよう prepare は切る
  if (!client) client = postgres(url, { max: 1, prepare: false, idle_timeout: 20 });
  return client;
}

let ready: Promise<void> | null = null;

/** 最初の一回だけ、帳面（テーブル）を用意する */
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const sql = db();
      await sql`create table if not exists users (
        id text primary key,
        email text unique not null,
        tickets int not null default 3,
        created_at timestamptz not null default now()
      )`;
      await sql`create table if not exists login_tokens (
        token text primary key,
        email text not null,
        expires_at timestamptz not null,
        used boolean not null default false
      )`;
      await sql`create table if not exists works (
        id text primary key,
        user_id text not null references users(id) on delete cascade,
        title text not null,
        order_json jsonb not null,
        stages_json jsonb not null default '[]'::jsonb,
        final_json jsonb,
        tickets int not null default 1,
        searches int not null default 0,
        status text not null default 'tailoring',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`;
      await sql`create index if not exists works_user_created on works (user_id, created_at desc)`;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}
