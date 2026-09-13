import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import type { Order } from "@/lib/order";
import { orderToText, ticketCost } from "@/lib/order";
import { buildStages } from "@/lib/stages";
import { buildSystemPrompt } from "@/lib/recipe";
import { mockStageText } from "@/lib/mock";
import type { TailorEvent } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel の上限に合わせ、1リクエスト＝1工程

const MODEL = process.env.BUNPITSUYA_MODEL || "claude-sonnet-5";

type Body = {
  order: Order;
  index: number;          // 何番目の工程か（0始まり）
  transcript: string[];   // これまでの工程の全文（index と同じ長さ）
};

/** 「===仕上がり=== … ===ここまで===」から題と本文を取り出す */
function extractFinal(text: string): { title: string; body: string[] } {
  const m = text.match(/===仕上がり===\s*([\s\S]*?)(?:===ここまで===|$)/);
  const raw = (m ? m[1] : text).trim();
  const lines = raw.split("\n");
  let title = "";
  if (lines[0]?.startsWith("# ")) title = lines.shift()!.replace(/^#\s*/, "").trim();
  const body = lines.join("\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return { title, body };
}

export async function POST(req: NextRequest) {
  const { order, index, transcript } = (await req.json()) as Body;
  if (!order?.title?.trim()) return new Response("品名（お題）が空です", { status: 400 });

  const stages = buildStages(order);
  if (!Number.isInteger(index) || index < 0 || index >= stages.length) return new Response("工程の番号が不正です", { status: 400 });
  if (!Array.isArray(transcript) || transcript.length !== index) return new Response("工程の控えが足りません", { status: 400 });

  const st = stages[index];
  const last = index === stages.length - 1;
  const useMock = process.env.MOCK === "1" || !process.env.ANTHROPIC_API_KEY;
  const enc = new TextEncoder();

  // 会話を組み直す: 注文票 → (指示, 出力) × index → 今回の指示
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: orderToText(order) }];
  for (let i = 0; i < index; i++) {
    messages.push({ role: "user", content: stages[i].instruction });
    messages.push({ role: "assistant", content: transcript[i] });
  }
  messages.push({ role: "user", content: st.instruction });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: TailorEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        send({ type: "stage-start", id: st.id, no: st.no, label: st.label, index, total: stages.length });
        let full = "";
        let buf = "";
        const flush = (final: boolean) => {
          const parts = buf.split(/\n\s*\n/);
          const tail = final ? "" : parts.pop() ?? "";
          for (const p of parts) if (p.trim()) send({ type: "note", id: st.id, text: p.trim() });
          buf = tail;
          if (!final && tail.trim()) send({ type: "partial", id: st.id, text: tail.trim() });
        };

        if (useMock) {
          const text = mockStageText(st.no, st.label, order.title);
          for (const ch of text.match(/[\s\S]{1,24}/g) ?? []) {
            full += ch; buf += ch; flush(false);
            await new Promise((r) => setTimeout(r, 30));
          }
        } else {
          const system = await buildSystemPrompt();
          const client = new Anthropic();
          const s = client.messages.stream({
            model: MODEL,
            max_tokens: 8000,
            system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
            messages,
          });
          for await (const ev of s) {
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
              full += ev.delta.text; buf += ev.delta.text; flush(false);
            }
          }
        }
        flush(true);
        send({ type: "stage-end", id: st.id, text: full, last });
        if (last) {
          const { title, body } = extractFinal(full);
          send({ type: "done", title: title || order.title, body, chars: body.join("").length, tickets: ticketCost(order) });
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
