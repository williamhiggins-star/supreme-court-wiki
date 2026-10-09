/**
 * Requests to supremecourt.gov within the approved budget:
 *   - one request at a time, at least 2 s apart (robots.txt asks for 1 s);
 *   - an identifying User-Agent;
 *   - If-Modified-Since when a previous Last-Modified is known;
 *   - on 429/5xx or a network error, back off (4 s, 8 s, 16 s …) and retry;
 *     after 3 such errors in a run, halt;
 *   - on 403, halt at once;
 *   - a per-run request cap, far under the 1,500-a-day ceiling.
 * The kill switch (COURT_ORDERS_OFF=1) is checked by the caller before any
 * request is made.
 */

export const USER_AGENT = "SCOTUSDashboard-orders/1.0 (+https://scotusdashboard.com)";
const MIN_SPACING_MS = 2000;
const MAX_ERRORS = 3;

export class CourtFetchHalt extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourtFetchHalt";
  }
}

export interface CourtResponse {
  status: 200 | 304;
  body: Buffer;
  lastModified: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class CourtFetcher {
  requests = 0;
  private errors = 0;
  private lastAt = 0;

  constructor(private readonly maxRequests: number) {}

  async get(url: string, ifModifiedSince?: string | null): Promise<CourtResponse> {
    for (;;) {
      if (this.requests >= this.maxRequests) throw new CourtFetchHalt(`request cap of ${this.maxRequests} reached`);
      const wait = this.lastAt + MIN_SPACING_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastAt = Date.now();
      this.requests++;

      let res: Response | null = null;
      try {
        res = await fetch(url, {
          headers: { "User-Agent": USER_AGENT, ...(ifModifiedSince ? { "If-Modified-Since": ifModifiedSince } : {}) },
          signal: AbortSignal.timeout(60_000),
        });
      } catch (err) {
        await this.backOff(`${url}: ${(err as Error).message}`);
        continue;
      }
      if (res.status === 304) return { status: 304, body: Buffer.alloc(0), lastModified: ifModifiedSince ?? null };
      if (res.status === 200) {
        return { status: 200, body: Buffer.from(await res.arrayBuffer()), lastModified: res.headers.get("last-modified") };
      }
      if (res.status === 403) throw new CourtFetchHalt(`403 from ${url}; halting`);
      if (res.status === 429 || res.status >= 500) {
        await this.backOff(`${res.status} from ${url}`);
        continue;
      }
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
  }

  private async backOff(what: string): Promise<void> {
    this.errors++;
    if (this.errors >= MAX_ERRORS) throw new CourtFetchHalt(`${what}; ${this.errors} errors this run, halting`);
    console.warn(`  [orders] ${what}; backing off`);
    await sleep(2000 * 2 ** this.errors);
  }
}
