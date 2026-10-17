import { handle, json } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = handle(async () => json(await getStore().listInterests()));
