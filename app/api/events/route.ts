import { bus } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events fallback for when LiveKit isn't configured.
 * Only reliable in a single server process (local dev); on Vercel use LiveKit.
 */
export async function GET(req: Request) {
  const channel = new URL(req.url).searchParams.get("channel");
  if (!channel || !/^(lobby|g-\d+)$/.test(channel)) return new Response("bad channel", { status: 400 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      const ping = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 15_000);
      bus.on(channel, send);
      cleanup = () => {
        clearInterval(ping);
        bus.off(channel, send);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
      controller.enqueue(encoder.encode(`: connected\n\n`));
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
