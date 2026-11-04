/**
 * Control of the loopback Siteverify fake that the E2E app calls instead of Cloudflare.
 * `playwright.config.ts` starts it and exports its URL to the workers.
 */

/** Action the fake reports by default: report creation's, the first protected form. */
export const ACCION_POR_DEFECTO = "crear_reporte"

/** URL of the fake; without it the suite was not started by Playwright. */
function fakeSiteverifyUrl() {
  const url = process.env.E2E_FAKE_SITEVERIFY_URL
  if (!url) throw new Error("Run the E2E suite with `npx playwright test`, which starts the fake Siteverify.")
  return url
}

async function post(path: string, body?: unknown) {
  const response = await fetch(`${fakeSiteverifyUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })
  if (!response.ok) throw new Error(`The fake Siteverify rejected ${path}: ${response.status}`)
}

/**
 * Makes the next verifications fail as an expired or reused token, so a test can watch the
 * server reject a submission and the form offer a retry.
 *
 * @param times - How many verifications fail before the fake answers successfully again.
 */
export async function rejectNextVerification(times = 1) {
  await post("/control/reject-next", { times })
}

/**
 * Changes the action a successful verification reports, so a spec can protect another form.
 * The server compares it with the action it expects; `resetSiteverify` restores the default.
 *
 * @param action - Action to report, such as `crear_reporte` or `comentar_reporte`.
 */
export async function setVerificationAction(action: string) {
  await post("/control/action", { action })
}

/**
 * Restores the always-pass answer and the default action; neither must survive the test that
 * changed it, or the next report creation fails for no reason.
 */
export async function resetSiteverify() {
  await post("/control/reset")
}
