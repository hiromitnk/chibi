import { redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { hasDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

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
          {hasDb ? <LoginForm notice={notice} /> : (
            <p style={{ fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.9 }}>
              台帳（DATABASE_URL）が設定されていないので、まだお客さまを覚えられません。<br />
              設定するまでは、入らずにそのまま仕立てられます。控えは残りません。
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
