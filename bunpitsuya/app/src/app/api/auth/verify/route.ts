import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema, hasDb } from "@/lib/db";
import { makeSession, sessionCookie, upsertUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasDb) return NextResponse.redirect(new URL("/login?e=nodb", req.nextUrl.origin));
  const token = req.nextUrl.searchParams.get("token") ?? "";
  await ensureSchema();

  const rows = await db()<{ email: string }[]>`
    update login_tokens set used = true
    where token = ${token} and used = false and expires_at > now()
    returning email`;
  if (!rows[0]) return NextResponse.redirect(new URL("/login?e=expired", req.nextUrl.origin));

  const user = await upsertUser(rows[0].email);
  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin));
  res.cookies.set(sessionCookie.name, makeSession(user.id), sessionCookie.options);
  return res;
}
