/**
 * Official Cloudflare Turnstile test keys, documented at
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 *
 * Test site keys always work from any hostname, so the widget tests never need real
 * credentials or a real challenge to be solved.
 */

/** Always passes the challenge without user interaction. */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA"

/** Always fails the challenge. */
export const TURNSTILE_TEST_SITE_KEY_ALWAYS_FAILS = "2x00000000000000000000AB"

/** Forces the interactive challenge. */
export const TURNSTILE_TEST_SITE_KEY_FORCES_INTERACTIVE = "3x00000000000000000000FF"
