import { defineCloudflareConfig } from "@opennextjs/cloudflare"
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache"
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache"
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue"

/**
 * OpenNext configuration for the Cloudflare Worker.
 *
 * - Incremental cache in R2 (bucket `reporty-next-cache`, binding `NEXT_INC_CACHE_R2_BUCKET`):
 *   prerendered pages and `unstable_cache` entries are served from it instead of rendering in the
 *   Worker on every request. Without it OpenNext uses a "dummy" cache that stores nothing.
 * - Regional cache in front of R2 (Cache API, long-lived): the bucket lives in ENAM, so repeated
 *   reads are answered from the nearest Cloudflare location.
 * - Memory queue: time-based ISR revalidation (`/comunidad` every minute) through the
 *   `WORKER_SELF_REFERENCE` service binding.
 */
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: "long-lived" }),
  queue: memoryQueue,
})
