import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { hasDb } from "@/lib/db";
import { getWork } from "@/lib/works";
import { SiteHeader } from "@/components/SiteHeader";
import { OrderRecap } from "@/components/OrderRecap";
import { SavedWork } from "@/components/SavedWork";

export const dynamic = "force-dynamic";

export default async function WorkPage({ params }: { params: Promise<{ id: string }> }) {
  if (!hasDb) redirect("/login");
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const work = await getWork(user.id, id);
  if (!work) notFound();

  const date = new Date(work.created_at).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="wrap">
      <SiteHeader />
      <p style={{ fontFamily: "var(--mono)", fontSize: 11.5, marginBottom: 20 }}><Link href="/history">← 控えの一覧</Link></p>
      <section>
        <p className="eyebrow">1 ｜ 注文票</p>
        <OrderRecap order={work.order} date={date} />
      </section>
      <SavedWork stages={work.stages} final={work.final} tickets={work.tickets} searches={work.searches} />
      {work.status !== "done" && (
        <p className="err">この仕立ては途中で止まっています。仕上がりは残っていません。</p>
      )}
    </div>
  );
}
