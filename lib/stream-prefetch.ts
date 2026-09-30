/**
 * Stream prefetch helper.
 *
 * Video card par hover karte hi hum backend ko "jaga" dete hain aur pehla chunk
 * (ya HLS playlist) maang lete hain. Render free tier cold-start me 20-40s leta
 * hai — hover ke waqt hi wo warm-up shuru ho jata hai, toh jab user actually
 * Stream dabaye tab playback bahut jaldi start hoti hai.
 *
 * Har URL ke liye ek hi in-flight request rakhte hain (dedupe), aur result ko
 * short TTL tak yaad rakhte hain taaki bar-bar hover se spam na ho.
 */

const PREFETCH_TTL_MS = 60_000;
const FIRST_CHUNK_BYTES = 1024 * 1024 - 1; // ~1 MiB probe

interface PrefetchEntry {
  at: number;
  promise: Promise<void>;
}

const prefetchCache = new Map<string, PrefetchEntry>();

/**
 * Warm the stream endpoint. Safe to call repeatedly (e.g. onMouseEnter).
 */
export function prefetchStream(url: string, token?: string | null): void {
  if (!url || typeof window === 'undefined') return;

  const cacheKey = `${url}::${token ? token.slice(-6) : 'anon'}`;
  const existing = prefetchCache.get(cacheKey);
  if (existing && Date.now() - existing.at < PREFETCH_TTL_MS) {
    return; // already warm / in-flight
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const isHls = url.includes('.m3u8');
  if (!isHls) {
    // Sirf pehla chunk maango — poori file nahi
    headers['Range'] = `bytes=0-${FIRST_CHUNK_BYTES}`;
  }

  const promise = fetch(url, { headers })
    .then(async (res) => {
      // Body ko drain kar do taaki connection reuse ho sake
      try {
        await res.arrayBuffer();
      } catch {
        /* ignore */
      }
    })
    .catch(() => {
      // Prefetch best-effort hai — fail hone par chup rehna hai
      prefetchCache.delete(cacheKey);
    });

  prefetchCache.set(cacheKey, { at: Date.now(), promise });
}

/** Testing/manual invalidation ke liye */
export function clearStreamPrefetch(): void {
  prefetchCache.clear();
}
