import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "@/lib/config";
import { AlertDoc } from "@/lib/alerts";
import { runPipeline } from "@/lib/pipeline";

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function guessKind(text: string): AlertDoc["kind"] {
  const t = text.toLowerCase();
  if (t.includes("boxed warning") || t.includes("black box")) return "boxed_warning";
  if (t.includes("label change") || t.includes("labeling change")) return "label_change";
  if (t.includes("shortage")) return "shortage";
  return "safety_communication";
}

/** Live alert ingest: raw FDA alert text -> CSC -> scan -> adjudicate -> verify -> persisted run.
 *  Streams the same SSE stage events as /api/run so the UI funnel animates identically. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const rawText: string = (body.rawText || "").trim();
  if (!rawText) return new Response(JSON.stringify({ error: "rawText required" }), { status: 400 });
  const title: string = (body.title || rawText.split("\n")[0]).trim().slice(0, 120);
  const hash = crypto.createHash("sha1").update(rawText).digest("hex").slice(0, 6);
  const id = `live-${slugify(title) || hash}-${hash}`;
  const alert: AlertDoc = {
    id,
    title,
    url: body.url || "pasted://live-ingest",
    datePublished: new Date().toISOString().slice(0, 10),
    kind: guessKind(rawText),
    excerpt: rawText.slice(0, 4000)
    // no curated csc: the CSC must come from the model, live
  };
  // Persist the alert so it shows in the inbox and its run can be reloaded.
  fs.mkdirSync(config.alertsDir, { recursive: true });
  fs.writeFileSync(path.join(config.alertsDir, `${id}.json`), JSON.stringify(alert, null, 2));
  fs.writeFileSync(path.join(config.alertsDir, `${id}.md`), `# ${title}\n\n${rawText}\n`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, payload: any) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      try {
        send("ingested", { alertId: id, title: alert.title, kind: alert.kind });
        const run = await runPipeline(alert, send);
        send("done", run);
      } catch (err: any) {
        send("error", { message: err?.message || String(err) });
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
