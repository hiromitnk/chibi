import { currentUser } from "@/lib/auth";
import { hasDb } from "@/lib/db";
import { SiteHeader } from "@/components/SiteHeader";
import { Studio } from "@/components/Studio";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await currentUser();
  // 台帳がまだ無い店では、券は画面の中だけの数え（今まで通り）
  const tickets = user ? user.tickets : hasDb ? 0 : 1;
  return (
    <div className="wrap">
      <SiteHeader tickets={tickets} />
      <Studio initialTickets={tickets} signedIn={Boolean(user)} hasLedger={hasDb} />
    </div>
  );
}
