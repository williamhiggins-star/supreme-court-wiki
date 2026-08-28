/**
 * hash.ts — stable content hashing for idempotent upserts.
 *
 * A sha256 of the mapped payload is stored inside raw._sync.content_hash.
 * On re-run we compare the freshly computed hash to the stored one and skip
 * unchanged rows, so a no-op sync produces zero writes and zero events.
 */

import { createHash } from "crypto";

/**
 * Deterministic JSON stringify: keys are sorted recursively so semantically
 * identical payloads always hash to the same value regardless of key order.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Hash of a mapped payload (caller passes the payload WITHOUT the _sync wrapper). */
export function contentHash(payload: unknown): string {
  return sha256Hex(stableStringify(payload));
}
