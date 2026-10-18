import { handle, json } from "@/lib/api";
import { getStore } from "@/lib/store";
import { lingerMs } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Not cached: presence and friendship lines must reflect joins/leaves as soon as the lobby event lands
 * (browsers honor stale-while-revalidate too, which kept rooms seconds behind).
 */
export const GET = handle(async () => {
  const graph = await getStore().getGraph(new Date(), lingerMs());
  return json(graph, { headers: { "cache-control": "no-store" } });
});
