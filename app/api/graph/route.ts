import { handle, json } from "@/lib/api";
import { getStore } from "@/lib/store";
import { lingerMs } from "@/lib/time";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const graph = await getStore().getGraph(new Date(), lingerMs());
  return json(graph, { headers: { "cache-control": "public, s-maxage=2, stale-while-revalidate=5" } });
});
