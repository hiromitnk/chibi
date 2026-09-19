import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { hasDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";

/** どの画面にも出る店の看板。券の残り・控え・出入口 */
export async function SiteHeader({ tickets }: { tickets?: number }) {
  const user = await currentUser();
  return (
    <header>
      <div className="brand"><Link href="/" style={{ color: "inherit", textDecoration: "none" }}>{BRAND.name}</Link> <small>{BRAND.domain}</small></div>
      <div className="tickets">
        {user ? (
          <>
            仕立て券 <b>{tickets ?? user.tickets}枚</b>
            <Link href="/history">控え</Link>
            <span title={user.email}>{user.email}</span>
            <form action="/api/auth/logout" method="post" style={{ display: "inline" }}>
              <button type="submit" style={{ background: "none", border: 0, color: "inherit", font: "inherit", cursor: "pointer", textDecoration: "underline" }}>出る</button>
            </form>
          </>
        ) : hasDb ? <Link href="/login">入口</Link> : <span>台帳なし（控えは残りません）</span>}
      </div>
    </header>
  );
}
