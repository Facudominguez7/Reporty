// Stand-in for Cloudflare Siteverify during E2E runs: the app points TURNSTILE_SITEVERIFY_URL
// here (loopback only, enforced by lib/security/turnstile.server.ts), so no real challenge is
// ever solved. Every verification passes unless a test asks for the next one to be rejected.
import { createServer } from "node:http"

const port = Number(process.env.PORT ?? 3198)
// Action the server verifies for report creation; overridable at runtime so a spec can point
// the same fake at another protected form.
const defaultAction = process.env.FAKE_TURNSTILE_ACTION ?? "crear_reporte"
const hostname = process.env.FAKE_TURNSTILE_HOSTNAME ?? "127.0.0.1"

// What a successful answer reports as its action.
let action = defaultAction

// How many upcoming verifications must fail before returning to the always-pass answer.
let rejectNext = 0

function readBody(request) {
  return new Promise((resolve) => {
    let body = ""
    request.on("data", (chunk) => (body += chunk))
    request.on("end", () => resolve(body))
  })
}

/** Reads the posted fields as form-urlencoded (what the app sends) or as JSON. */
function readFields(raw, contentType) {
  if (contentType.includes("application/json")) {
    try {
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }
  return Object.fromEntries(new URLSearchParams(raw))
}

function send(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(payload))
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`)

  if (request.method === "GET" && url.pathname === "/health") return send(response, 200, { ok: true })

  // What the server calls for `verificarTurnstile`: secret plus single-use response token.
  if (request.method === "POST" && url.pathname === "/siteverify") {
    const fields = readFields(await readBody(request), request.headers["content-type"] ?? "")
    const secret = typeof fields.secret === "string" ? fields.secret : ""
    const token = typeof fields.response === "string" ? fields.response : ""

    if (!secret) return send(response, 200, { success: false, "error-codes": ["missing-input-secret"] })
    if (!token) return send(response, 200, { success: false, "error-codes": ["missing-input-response"] })

    if (rejectNext > 0) {
      rejectNext -= 1
      return send(response, 200, { success: false, "error-codes": ["timeout-or-duplicate"] })
    }

    return send(response, 200, { success: true, hostname, action, "error-codes": [] })
  }

  // Control used by the tests: the next verification fails as an expired or reused token.
  if (request.method === "POST" && url.pathname === "/control/reject-next") {
    const raw = await readBody(request)
    const fields = readFields(raw, request.headers["content-type"] ?? "")
    const times = Number(fields.times ?? url.searchParams.get("times") ?? 1)
    rejectNext = Number.isFinite(times) && times > 0 ? Math.floor(times) : 1
    return send(response, 200, { ok: true, rejectNext })
  }

  // Control used by the tests: the action a successful verification reports.
  if (request.method === "POST" && url.pathname === "/control/action") {
    const raw = await readBody(request)
    const fields = readFields(raw, request.headers["content-type"] ?? "")
    const siguiente = typeof fields.action === "string" ? fields.action.trim() : ""
    if (!siguiente) return send(response, 400, { message: "`action` must be a non-empty string" })
    action = siguiente
    return send(response, 200, { ok: true, action })
  }

  // Control used by the tests: the fake answers every verification again, with the default action.
  if (request.method === "POST" && url.pathname === "/control/reset") {
    rejectNext = 0
    action = defaultAction
    return send(response, 200, { ok: true, action })
  }

  send(response, 404, { message: "Not found" })
}).listen(port, "127.0.0.1", () => console.log(`Fake Siteverify listening on http://127.0.0.1:${port}`))
