import { NextRequest } from "next/server";
import { runPipeline } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  const { alertId } = await req.json();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, payload: any) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      try {
        const run = await runPipeline(alertId, send);
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
