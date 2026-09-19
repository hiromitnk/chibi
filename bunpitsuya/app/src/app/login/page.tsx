import { redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { hasDb, ledgerHints } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

function NoLedger() {
  const { checked, seen } = ledgerHints();
  const mono = { fontFamily: "var(--mono)", fontSize: 11.5, lineHeight: 1.9 } as const;
  return (
    <div style={{ color: "var(--ink)" }}>
      <p style={{ ...mono, fontSize: 12 }}>
        台帳がまだ繋がっていないので、お客さまを覚えられません。<br />
        このままでも仕立てられます。控えが残らないだけです。
      </p>
      <p style={{ ...mono, color: "var(--ink-soft)", marginTop: 18 }}>
        店が探した名前：{checked.join(" / ")}<br />
        今このアプリに見えている名前：{seen.length ? seen.join(" / ") : "（ひとつも無し）"}
      </p>
      <p style={{ ...mono, color: "var(--ink-soft)" }}>
        {seen.length === 0
          ? "ひとつも見えていません。Vercel の Storage で Postgres を作り、作ったあとに Redeploy してください（既にある配信には後から入った環境変数は届きません）。"
          : "名前は見えているのに繋がらないときは、上の「探した名前」のどれかに同じ値を入れてください。"}
      </p>
    </div>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await currentUser()) redirect("/");
  const { e } = await searchParams;
  const notice = e === "expired" ? "その合鍵はもう使えません。もう一度お送りします。"
    : e === "nodb" ? "この店はまだ台帳を持っていません。" : null;

  return (
    <div className="wrap">
      <header>
        <div className="brand">{BRAND.name} <small>{BRAND.domain}</small></div>
      </header>
      <section>
        <p className="eyebrow">入口</p>
        <div className="slip" style={{ maxWidth: 520 }}>
          <div className="slip-title"><h2>合鍵をお送りします</h2></div>
          {hasDb ? <LoginForm notice={notice} /> : <NoLedger />}
        </div>
      </section>
    </div>
  );
}
