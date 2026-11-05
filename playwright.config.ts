import { execSync } from "node:child_process"

import { defineConfig } from "@playwright/test"

const APP_PORT = 3100
const FAKE_RESEND_PORT = 3199
const FAKE_SITEVERIFY_PORT = 3198

/**
 * Official Cloudflare site key that always passes without interaction. Safe in tests: it can
 * never verify against a real secret and it is not used in production.
 */
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA"

/** Keys of the local Supabase stack. The suite never runs against production. */
function localSupabase(): { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string; MAILPIT_URL: string; DB_URL: string } {
  try {
    const output = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    return JSON.parse(output.slice(output.indexOf("{")))
  } catch {
    throw new Error("The local Supabase stack is not running. Start it with `npm run db:start` (see supabase/README.md).")
  }
}

const supabase = localSupabase()

// Shared with the test workers, which inherit the runner's environment.
process.env.E2E_SUPABASE_URL = supabase.API_URL
process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = supabase.SERVICE_ROLE_KEY
// Some tables only grant the service role read access, so cleanup of those rows goes over SQL.
process.env.E2E_SUPABASE_DB_URL = supabase.DB_URL
process.env.E2E_MAILPIT_URL = supabase.MAILPIT_URL
process.env.E2E_FAKE_RESEND_URL = `http://127.0.0.1:${FAKE_RESEND_PORT}`
process.env.E2E_FAKE_SITEVERIFY_URL = `http://127.0.0.1:${FAKE_SITEVERIFY_PORT}`

export default defineConfig({
  testDir: "./e2e",
  // Tests share one database, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    // The installed Google Chrome: no browser downloads.
    channel: "chrome",
    headless: !process.env.E2E_HEADED,
    locale: "es-AR",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/support/fake-resend.mjs",
      url: `http://127.0.0.1:${FAKE_RESEND_PORT}/health`,
      env: { PORT: String(FAKE_RESEND_PORT) },
      reuseExistingServer: true,
    },
    {
      // Siteverify stand-in: the app's server calls this instead of Cloudflare, so E2E never
      // depends on a real challenge.
      command: "node e2e/support/fake-siteverify.mjs",
      url: `http://127.0.0.1:${FAKE_SITEVERIFY_PORT}/health`,
      env: { PORT: String(FAKE_SITEVERIFY_PORT) },
      reuseExistingServer: true,
    },
    {
      // A production build, like the real site. Variables set here win over `.env`, which points
      // to production. The challenge stays on with the official always-pass test site key and a
      // non-dummy secret, and its server verification goes to the loopback fake; Google
      // Analytics stays off.
      command: `npm run build && npx next start -p ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}/robots.txt`,
      timeout: 300_000,
      reuseExistingServer: true,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: supabase.API_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: supabase.SERVICE_ROLE_KEY,
        NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${APP_PORT}`,
        RESEND_API_KEY: "re_e2e_fake_key",
        RESEND_BASE_URL: `http://127.0.0.1:${FAKE_RESEND_PORT}`,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY,
        // Production rejects the official dummy secrets, so a fake non-dummy one is used; only
        // the loopback fake ever sees it.
        TURNSTILE_SECRET_KEY: "e2e-fake-siteverify-secret",
        TURNSTILE_ALLOWED_HOSTNAMES: "127.0.0.1",
        TURNSTILE_SITEVERIFY_URL: `http://127.0.0.1:${FAKE_SITEVERIFY_PORT}/siteverify`,
        NEXT_PUBLIC_GA_ID: "",
      },
    },
  ],
})
