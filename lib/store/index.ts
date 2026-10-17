import "server-only";
import { oracleConfigured } from "../db";
import { memoryStore } from "./memory";
import { oracleStore } from "./oracle";
import type { Store } from "./types";

/** OCI Autonomous Database when ORACLE_* env vars are set; otherwise an in-memory demo world. */
export function getStore(): Store {
  return oracleConfigured() ? oracleStore : memoryStore;
}
