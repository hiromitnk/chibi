import { randomUUID } from "node:crypto";
import type { Order } from "./order";
import { db, ensureSchema } from "./db";

/** 台帳に残す、一工程ぶんの控え */
export type SavedStage = { id: string; no: number; label: string; notes: string[]; text: string; searches: number };
export type SavedFinal = { title: string; body: string[]; chars: number };

export type Work = {
  id: string;
  title: string;
  order: Order;
  stages: SavedStage[];
  final: SavedFinal | null;
  tickets: number;
  searches: number;
  status: "tailoring" | "done";
  created_at: string;
};

type Row = {
  id: string; title: string; order_json: Order; stages_json: SavedStage[]; final_json: SavedFinal | null;
  tickets: number; searches: number; status: Work["status"]; created_at: Date;
};

const toWork = (r: Row): Work => ({
  id: r.id, title: r.title, order: r.order_json, stages: r.stages_json ?? [], final: r.final_json,
  tickets: r.tickets, searches: r.searches, status: r.status, created_at: r.created_at.toISOString(),
});

/** 券を引いてから、一本ぶんの控えを起こす。券が足りなければ null */
export async function openWork(userId: string, order: Order, cost: number): Promise<string | null> {
  await ensureSchema();
  const sql = db();
  const paid = await sql<{ id: string }[]>`
    update users set tickets = tickets - ${cost} where id = ${userId} and tickets >= ${cost} returning id`;
  if (!paid[0]) return null;

  const id = randomUUID();
  await sql`insert into works (id, user_id, title, order_json, tickets)
            values (${id}, ${userId}, ${order.title.trim()}, ${sql.json(order as never)}, ${cost})`;
  return id;
}

export async function appendStage(workId: string, stage: SavedStage): Promise<void> {
  const sql = db();
  await sql`update works set
    stages_json = stages_json || ${sql.json([stage] as never)},
    searches = searches + ${stage.searches},
    updated_at = now()
    where id = ${workId}`;
}

export async function closeWork(workId: string, final: SavedFinal): Promise<void> {
  const sql = db();
  await sql`update works set final_json = ${sql.json(final as never)}, title = ${final.title},
            status = 'done', updated_at = now() where id = ${workId}`;
}

export async function listWorks(userId: string, limit = 50): Promise<Work[]> {
  await ensureSchema();
  const rows = await db()<Row[]>`
    select id, title, order_json, stages_json, final_json, tickets, searches, status, created_at
    from works where user_id = ${userId} order by created_at desc limit ${limit}`;
  return rows.map(toWork);
}

export async function getWork(userId: string, id: string): Promise<Work | null> {
  await ensureSchema();
  const rows = await db()<Row[]>`
    select id, title, order_json, stages_json, final_json, tickets, searches, status, created_at
    from works where id = ${id} and user_id = ${userId}`;
  return rows[0] ? toWork(rows[0]) : null;
}

export async function deleteWork(userId: string, id: string): Promise<void> {
  await ensureSchema();
  await db()`delete from works where id = ${id} and user_id = ${userId}`;
}
