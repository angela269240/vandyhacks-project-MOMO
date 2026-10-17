import { localBlobs } from "@/lib/storage";

/** Local-dev stand-in for OCI Object Storage avatar uploads (process memory only). */
const MAX_BYTES = 2 * 1024 * 1024;

export async function PUT(req: Request, ctx: RouteContext<"/api/avatars/local/[key]">) {
  const { key } = await ctx.params;
  if (!decodeURIComponent(key).startsWith("avatars/")) return new Response(null, { status: 400 });
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength > MAX_BYTES) return new Response(null, { status: 413 });
  localBlobs.set(key, { type: req.headers.get("content-type") ?? "image/jpeg", body });
  return new Response(null, { status: 200 });
}

export async function GET(_req: Request, ctx: RouteContext<"/api/avatars/local/[key]">) {
  const { key } = await ctx.params;
  const blob = localBlobs.get(key);
  if (!blob) return new Response(null, { status: 404 });
  return new Response(new Blob([blob.body as BlobPart], { type: blob.type }), {
    headers: { "cache-control": "public, max-age=31536000, immutable" },
  });
}
