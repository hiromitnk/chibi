import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { hasDb } from "@/lib/db";
import { listWorks } from "@/lib/works";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  if (!hasDb) redirect("/login");
  const user = await currentUser();
  if (!user) redirect("/login");

  const works = await listWorks(user.id);
  const fmt = (iso: string) => new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="wrap">
      <SiteHeader />
      <section>
        <p className="eyebrow">控え</p>
        {works.length === 0 ? (
          <p className="empty">まだ仕立てた覚えがありません。<Link href="/">注文票へ</Link></p>
        ) : (
          <div className="slip">
            <table className="ledger">
              <thead><tr><th>仕立てた日</th><th>品名</th><th>字数</th><th>券</th><th>検索</th></tr></thead>
              <tbody>
                {works.map((w) => (
                  <tr key={w.id}>
                    <td className="mono">{fmt(w.created_at)}</td>
                    <td><Link href={`/history/${w.id}`}>{w.title || "（題なし）"}</Link>
                      {w.status !== "done" && <span className="tag">仕立て中で止まっています</span>}</td>
                    <td className="mono num">{w.final ? w.final.chars.toLocaleString() : "—"}</td>
                    <td className="mono num">{w.tickets}</td>
                    <td className="mono num">{w.searches || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
