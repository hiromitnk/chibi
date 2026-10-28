"use client";
import { useState } from "react";

export function LoginForm({ notice }: { notice: string | null }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true); setError(null); setLink(null);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { sent?: boolean; url?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSent(true);
      if (data.url) setLink(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <div>
        <p className="hand" style={{ fontSize: 18 }}>{link ? "合鍵はこちらです。" : "合鍵をメールでお送りしました。"}</p>
        {link && <p style={{ fontFamily: "var(--mono)", fontSize: 12, wordBreak: "break-all" }}><a href={link}>{link}</a></p>}
        <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-faint)" }}>30分で閉まります。</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {notice && <p style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "#8a3a2a" }}>{notice}</p>}
      <div className="field">
        <label>メール</label>
        <input className="hand" type="email" required value={email} placeholder="you@example.com"
          onChange={(ev) => setEmail(ev.target.value)} style={{ fontSize: 19 }} />
      </div>
      <div className="slip-foot">
        <div className="cost">はじめての方には、お試しの券を3枚お渡しします。</div>
        <button className="btn" disabled={busy || !email}>{busy ? "お送り中…" : "合鍵を送る"}</button>
      </div>
      {error && <p className="err">{error}</p>}
    </form>
  );
}
