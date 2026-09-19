import postgres from "postgres";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

/** 台帳（データベース）が繋がっているか。無ければ店は「控えを取らない」で動く */
export const hasDb = Boolean(url);

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
