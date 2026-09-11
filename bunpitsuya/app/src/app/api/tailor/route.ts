import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import type { Order } from "@/lib/order";
import { orderToText, ticketCost } from "@/lib/order";
import { buildStages } from "@/lib/stages";
import { buildSystemPrompt } from "@/lib/recipe";
import { mockStageText } from "@/lib/mock";
import type { TailorEvent } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 800;

const MODEL = process.env.BUNPITSUYA_MODEL || "claude-sonnet-5";

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
  const order = (await req.json()) as Order;
  if (!order?.title?.trim()) {
    return new Response(JSON.stringify({ error: "品名（お題）が空です" }), { status: 400 });
  }

  const stages = buildStages(order);
  const useMock = process.env.MOCK === "1" || !process.env.ANTHROPIC_API_KEY;
  const client = useMock ? null : new Anthropic();
  const system = await buildSystemPrompt();
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: TailorEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: orderToText(order) }];
      let lastStageText = "";

      try {
        for (const st of stages) {
          send({ type: "stage-start", id: st.id, no: st.no, label: st.label });
          messages.push({ role: "user", content: st.instruction });

          let full = "";
          let buf = "";
          const flushParagraphs = (final: boolean) => {
            // 空行で段落を閉じる。最後の欠片は final のときだけ閉じる
            const parts = buf.split(/\n\s*\n/);
            const tail = final ? "" : parts.pop() ?? "";
            for (const p of parts) if (p.trim()) send({ type: "note", id: st.id, text: p.trim() });
            buf = tail;
            if (!final && tail.trim()) send({ type: "partial", id: st.id, text: tail.trim() });
          };

          if (useMock) {
            const text = mockStageText(st.no, st.label, order.title);
            for (const ch of text.match(/[\s\S]{1,24}/g) ?? []) {
              full += ch; buf += ch; flushParagraphs(false);
              await new Promise((r) => setTimeout(r, 40));
            }
          } else {
            const s = client!.messages.stream({
              model: MODEL,
              max_tokens: 8000,
              system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
              messages,
            });
            for await (const ev of s) {
              if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
                full += ev.delta.text; buf += ev.delta.text; flushParagraphs(false);
              }
            }
          }
          flushParagraphs(true);
          messages.push({ role: "assistant", content: full });
          lastStageText = full;
          send({ type: "stage-end", id: st.id });
        }

        const { title, body } = extractFinal(lastStageText);
        send({ type: "done", title: title || order.title, body, chars: body.join("").length, tickets: ticketCost(order) });
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
