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

  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + 30 * 60 * 1000); // 30分
  try {
    await ensureSchema();
    await db()`insert into login_tokens (token, email, expires_at) values (${token}, ${address}, ${expires})`;
  } catch (err) {
    // 接続先が違う・止まっている、など。黙って500にせず、何が起きたか返す
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[auth] 台帳に書けませんでした", err);
    return NextResponse.json({ error: `台帳に繋がりませんでした。接続先を確かめてください（${detail}）` }, { status: 503 });
  }

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
