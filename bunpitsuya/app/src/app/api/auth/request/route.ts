import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db, ensureSchema, hasDb } from "@/lib/db";
import { sendKey } from "@/lib/mail";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasDb) return NextResponse.json({ error: "この店はまだ台帳を持っていません（DATABASE_URL 未設定）" }, { status: 503 });

  const { email } = (await req.json()) as { email?: string };
  const address = (email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return NextResponse.json({ error: "メールの宛先を確かめてください" }, { status: 400 });
  }

  await ensureSchema();
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + 30 * 60 * 1000); // 30分
  await db()`insert into login_tokens (token, email, expires_at) values (${token}, ${address}, ${expires})`;

  const origin = process.env.APP_ORIGIN || req.nextUrl.origin;
  const url = `${origin}/api/auth/verify?token=${token}`;

  try {
    const sent = await sendKey(address, url);
    if (sent) return NextResponse.json({ sent: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  // メールの送り口がまだ無いとき。試用のあいだだけ、画面にリンクを出す
  if (process.env.SHOW_KEY_ON_SCREEN === "1") return NextResponse.json({ sent: false, url });
  return NextResponse.json({ error: "メールの送り口が設定されていません（RESEND_API_KEY と MAIL_FROM）" }, { status: 503 });
}
