"use client";
import { useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { OrderSlip } from "@/components/OrderSlip";
import { Desk } from "@/components/Desk";
import { Book } from "@/components/Book";
import { useTailor } from "@/lib/useTailor";
import { ticketCost, type Order } from "@/lib/order";

export default function Page() {
  const { stacks, final, error, busy, start } = useTailor();
  const [tickets, setTickets] = useState(1); // お試し1枚。永続化は2週目
  const deskRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (stacks.length === 1) deskRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [stacks.length]);
  useEffect(() => { if (final) bookRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [final]);

  const onOrder = (o: Order) => { setTickets((t) => t - ticketCost(o)); start(o); };

  return (
    <div className="wrap">
      <header>
        <div className="brand">{BRAND.name} <small>{BRAND.domain}</small></div>
        <div className="tickets">仕立て券 <b>{tickets}枚</b> <a href="#">追加する</a></div>
      </header>
      <OrderSlip tickets={tickets} busy={busy} onOrder={onOrder} />
      {error && <p className="err">仕立てが止まりました: {error}</p>}
      <div ref={deskRef}><Desk stacks={stacks} /></div>
      <div ref={bookRef}>{final && <Book final={final} />}</div>
    </div>
  );
}
