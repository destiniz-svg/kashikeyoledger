/**
 * Choose a LedgerStore backend from the environment.
 *
 * If `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `KASHIKEYO_ORG_ID` are all
 * set, the Supabase-backed store is used. Otherwise it falls back to the
 * in-memory store so the service still runs locally without any secrets.
 */
import { MemoryStore } from "./memoryStore.ts";
import type { LedgerStore } from "./store.ts";
import { SupabaseStore } from "./supabaseStore.ts";

export function createStore(env: NodeJS.ProcessEnv = process.env): LedgerStore {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const org = env.KASHIKEYO_ORG_ID;
  if (url && key && org) {
    return new SupabaseStore({
      url,
      key,
      org,
      anthropicKey: env.ANTHROPIC_API_KEY,
      anthropicModel: env.ANTHROPIC_MODEL,
    });
  }
  return new MemoryStore();
}
