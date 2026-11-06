/**
 * Pending URL-mode elicitations, kept in KV so any instance can serve the browser page and the
 * client's retry. There is no session: the random id in the URL is the only handle.
 * @module
 */

export const URL_ELICITATION_TTL_MS = 60 * 60 * 1000;

export type UrlElicitationStatus = "pending" | "confirmed" | "cancelled";

export type UrlElicitationRecord = {
  label: string;
  status: UrlElicitationStatus;
  /** KV `expireIn` is only a lower bound on deletion, so reads check this too. */
  expiresAt: number;
};

const elicitationKey = (id: string): Deno.KvKey => ["url-elicitation", id];

/** Stores a pending elicitation and returns its id. */
export async function createUrlElicitation(kv: Deno.Kv, label: string): Promise<string> {
  const id = crypto.randomUUID();
  const record: UrlElicitationRecord = {
    label,
    status: "pending",
    expiresAt: Date.now() + URL_ELICITATION_TTL_MS,
  };
  await kv.set(elicitationKey(id), record, { expireIn: URL_ELICITATION_TTL_MS });
  return id;
}

/** Returns the record unless it is unknown or expired. */
export async function getUrlElicitation(
  kv: Deno.Kv,
  id: string,
): Promise<UrlElicitationRecord | undefined> {
  const { value } = await kv.get<UrlElicitationRecord>(elicitationKey(id));
  if (!value || value.expiresAt <= Date.now()) return undefined;
  return value;
}

/** Moves a pending elicitation to its final status. Returns false if it was not pending. */
export async function resolveUrlElicitation(
  kv: Deno.Kv,
  id: string,
  status: Exclude<UrlElicitationStatus, "pending">,
): Promise<boolean> {
  const key = elicitationKey(id);
  const entry = await kv.get<UrlElicitationRecord>(key);
  const record = entry.value;
  if (!record || record.status !== "pending" || record.expiresAt <= Date.now()) return false;
  const { ok } = await kv.atomic()
    .check(entry)
    .set(key, { ...record, status }, { expireIn: record.expiresAt - Date.now() })
    .commit();
  return ok;
}
