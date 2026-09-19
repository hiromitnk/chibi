import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import type { Order } from "@/lib/order";
import { orderToText, ticketCost, searchUses } from "@/lib/order";
import { buildStages } from "@/lib/stages";
import { buildSystemPrompt } from "@/lib/recipe";
import { mockStageText } from "@/lib/mock";
import type { TailorEvent } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel の上限に合わせ、1リクエスト＝1工程

// 筆は店が決める。前半（1〜5）と後半（6〜8）で変えられる
const MODEL = process.env.BUNPITSUYA_MODEL || "claude-sonnet-5";
const MODEL_HEAVY = process.env.BUNPITSUYA_MODEL_HEAVY || MODEL;
const MAX_CONTINUATIONS = 5; // 検索の周回が長いと pause_turn で止まるので、続きを頼む回数の上限

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

  // 検索は 仕入れ（2）と 見直しの裏取り（7）だけ。上限は仕入れ先と手間で決まる
  const uses = st.no === 2 ? searchUses(order.knobs.source, order.knobs.effort) : st.no === 7 ? Math.min(3, searchUses(order.knobs.source, order.knobs.effort)) : 0;
  const tools = uses > 0
    ? [{
        type: "web_search_20260209" as const,
        name: "web_search" as const,
        max_uses: uses,
        ...(order.knobs.source === "国内で" ? { user_location: { type: "approximate" as const, country: "JP", timezone: "Asia/Tokyo" } } : {}),
      }]
    : undefined;

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
      let searches = 0;
      const t0 = Date.now();
      try {
        send({ type: "stage-start", id: st.id, no: st.no, label: st.label, index, total: stages.length });
        let full = "";
        let buf = "";
        // 工程の見出し行（# 2 ｜ 仕入れ 1/3 など）は付箋の h4 と重なるので、付箋には流さない。控え（full）には残る
        const stripHeading = (p: string) => p.replace(/^#\s*\d+\s*[｜|][^\n]*\n?/, "").trim();
        const flush = (final: boolean) => {
          const parts = buf.split(/\n\s*\n/);
          const tail = final ? "" : parts.pop() ?? "";
          for (const p of parts) { const t = stripHeading(p); if (t) send({ type: "note", id: st.id, text: t }); }
          buf = tail;
          const t = stripHeading(tail); if (!final && t) send({ type: "partial", id: st.id, text: t });
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
          const model = st.no >= 6 ? MODEL_HEAVY : MODEL;

          // 検索で pause_turn が返ったら、同じ会話で続きを頼む
          for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
            const s = client.messages.stream({
              model,
              max_tokens: 32000,
              system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
              messages,
              ...(tools ? { tools } : {}),
            });
            s.on("contentBlock", (block) => {
              if (block.type === "server_tool_use" && block.name === "web_search") {
                searches++;
                const q = (block.input as { query?: string })?.query ?? "";
                send({ type: "search", id: st.id, query: q });
              }
            });
            for await (const ev of s) {
              if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
                full += ev.delta.text; buf += ev.delta.text; flush(false);
              }
            }
            const msg = await s.finalMessage();
            console.log(`[tailor] ${st.label} stop=${msg.stop_reason} in=${msg.usage.input_tokens} out=${msg.usage.output_tokens} cache_read=${msg.usage.cache_read_input_tokens ?? 0}`);
            if (msg.stop_reason !== "pause_turn") {
              // からっぽで返ったら「完了」にしない。理由を添えて止める（画面側が一度やり直す）
              if (!full.trim()) throw new Error(`仕立て手から文章が返りませんでした（stop_reason: ${msg.stop_reason}）。もう一度お試しください`);
              if (msg.stop_reason === "max_tokens") send({ type: "note", id: st.id, text: "（ここで長さの上限に当たって切れました）" });
              break;
            }
            messages.push({ role: "assistant", content: msg.content });
          }
        }
        flush(true);
        console.log(`[tailor] ${st.label} ${((Date.now() - t0) / 1000).toFixed(1)}s ${full.length}字 検索${searches}回`);
        send({ type: "stage-end", id: st.id, text: full, last, searches });
        if (last) {
          const { title, body } = extractFinal(full);
          send({ type: "done", title: title || order.title, body, chars: body.join("").length, tickets: ticketCost(order) });
        }
      } catch (err) {
        console.error(`[tailor] ${st.label} failed after ${((Date.now() - t0) / 1000).toFixed(1)}s`, err);
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
