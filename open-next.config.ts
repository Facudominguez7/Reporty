import { defineCloudflareConfig } from "@opennextjs/cloudflare"

/**
 * OpenNext configuration for the Cloudflare Worker.
 * The incremental cache (used by `unstable_cache` for the lookup tables) is added once the R2
 * bucket exists in the Cloudflare account; until then the default cache is used.
 */
export default defineCloudflareConfig({})
