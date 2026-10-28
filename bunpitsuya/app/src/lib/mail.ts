/** 合鍵（ログイン用のリンク）をメールで送る。送り口が無ければ false を返す */
export async function sendKey(email: string, url: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: email,
      subject: "文筆屋さんの合鍵",
      text: [
        "文筆屋さんへようこそ。",
        "",
        "下のリンクを開くと、お店に入れます。30分で閉まります。",
        url,
        "",
        "お心当たりがなければ、この便りは捨ててください。",
      ].join("\n"),
    }),
  });
  if (!res.ok) throw new Error(`合鍵を送れませんでした（${res.status}）: ${await res.text()}`);
  return true;
}
