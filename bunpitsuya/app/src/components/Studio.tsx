"use client";
import { useEffect, useRef, useState } from "react";
import { OrderSlip } from "@/components/OrderSlip";
import { Desk } from "@/components/Desk";
import { Book } from "@/components/Book";
import { useTailor } from "@/lib/useTailor";
import { ticketCost, type Order } from "@/lib/order";

export function Studio({ initialTickets, signedIn, hasLedger }: { initialTickets: number; signedIn: boolean; hasLedger: boolean }) {
  const { stacks, final, error, busy, start } = useTailor();
  const [tickets, setTickets] = useState(initialTickets);
  const deskRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (stacks.length === 1) deskRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [stacks.length]);
  useEffect(() => { if (final) bookRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [final]);
  // 台帳が券を引いたら、その数に合わせ直す
  useEffect(() => { if (final?.ticketsLeft !== undefined) setTickets(final.ticketsLeft); }, [final]);

  const onOrder = (o: Order) => { setTickets((t) => t - ticketCost(o)); start(o); };

  return (
    <>
      <OrderSlip tickets={tickets} busy={busy} onOrder={onOrder} />
      {error && <p className="err">仕立てが止まりました: {error}</p>}
      {hasLedger && !signedIn && <p className="warn">お店に入っていないので、仕立てた控えは残りません。<a href="/login">入口へ</a></p>}
      <div ref={deskRef}><Desk stacks={stacks} /></div>
      <div ref={bookRef}>{final && <Book final={final} />}</div>
    </>
  );
}
