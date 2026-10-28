import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db, ensureSchema, hasDb } from "./db";

const COOKIE = "bunpitsuya_session";
const MAX_AGE = 60 * 60 * 24 * 60; // 60日

// 鍵が無いときは起動ごとの使い捨て。再デプロイで入り直しになる（起動時に一度だけ告げる）
const secret = process.env.AUTH_SECRET || randomUUID();
if (!process.env.AUTH_SECRET && hasDb) {
  console.warn("[auth] AUTH_SECRET が未設定です。再デプロイのたびに入り直しになります");
}

function sign(value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function makeSession(userId: string): string {
  const body = `${userId}.${Date.now()}`;
  return `${body}.${sign(body)}`;
}

function readSession(raw: string | undefined): string | null {
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i < 0) return null;
  const body = raw.slice(0, i), mac = raw.slice(i + 1);
  if (!safeEqual(sign(body), mac)) return null;
  const [userId, issued] = body.split(".");
  if (!userId || !issued) return null;
  if (Date.now() - Number(issued) > MAX_AGE * 1000) return null;
  return userId;
}

export const sessionCookie = {
  name: COOKIE,
  options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE },
};

export type User = { id: string; email: string; tickets: number };

/** cookie から今のお客さまを引く。台帳が無い／入っていなければ null */
export async function currentUser(): Promise<User | null> {
  if (!hasDb) return null;
  const jar = await cookies();
  return userFromCookieValue(jar.get(COOKIE)?.value);
}

/** route handler 用（NextRequest の cookie 値をそのまま渡す） */
export async function userFromCookieValue(raw: string | undefined): Promise<User | null> {
  if (!hasDb) return null;
  const id = readSession(raw);
  if (!id) return null;
  await ensureSchema();
  const rows = await db()<User[]>`select id, email, tickets from users where id = ${id}`;
  return rows[0] ?? null;
}

/** メールでお客さまを引く。居なければ帳面に加える（お試し3枚） */
export async function upsertUser(email: string): Promise<User> {
  await ensureSchema();
  const sql = db();
  const normalized = email.trim().toLowerCase();
  const rows = await sql<User[]>`
    insert into users (id, email) values (${randomUUID()}, ${normalized})
    on conflict (email) do update set email = excluded.email
    returning id, email, tickets`;
  return rows[0];
}
