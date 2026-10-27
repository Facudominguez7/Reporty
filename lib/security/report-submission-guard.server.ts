import "server-only"

import { createHash } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Report submission limits. A UUID-only limit is not enough because anyone can mint
 * new anonymous identities, so every submission is also counted per hashed client IP.
 * The IP limit is generous on purpose: mobile carriers share IPs (CGNAT).
 */
export const REPORT_SUBMISSION_LIMITS = {
  actorWindowSeconds: 60 * 60,
  actorMax: 5,
  ipWindowSeconds: 60 * 60,
  ipMax: 10,
} as const

export type ReportSubmissionClaim = "ok" | "duplicate" | "actor_limited" | "ip_limited"

const CLAIM_MESSAGES: Record<Exclude<ReportSubmissionClaim, "ok">, string> = {
  duplicate: "Este reporte ya se está enviando. Esperá unos segundos y revisá Mis reportes.",
  actor_limited: "Alcanzaste el límite de reportes por hora. Probá de nuevo más tarde.",
  ip_limited: "Se enviaron demasiados reportes desde tu red. Probá de nuevo más tarde.",
}

export function reportSubmissionClaimMessage(claim: Exclude<ReportSubmissionClaim, "ok">) {
  return CLAIM_MESSAGES[claim]
}

/**
 * Extracts the client IP from proxy headers (Vercel sets `x-forwarded-for` / `x-real-ip`)
 * and hashes it so raw IPs are never stored.
 */
export function hashClientIp(requestHeaders: Headers) {
  const forwardedIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
  const ip = forwardedIp || requestHeaders.get("x-real-ip")?.trim() || "unknown"
  const salt = process.env.REPORT_RATE_LIMIT_SALT ?? "jackemate-report-rate-limit"

  return createHash("sha256").update(`${salt}:${ip}`).digest("hex")
}

/**
 * Atomically checks the limits and records the submission (idempotency key included).
 * Must run with the service-role client: the RPC is not granted to client roles.
 */
export async function claimReportSubmission(
  adminClient: SupabaseClient,
  input: { submissionId: string; actorId: string; ipHash: string },
): Promise<ReportSubmissionClaim> {
  const { data, error } = await adminClient.rpc("claim_report_submission", {
    p_submission_id: input.submissionId,
    p_actor_id: input.actorId,
    p_ip_hash: input.ipHash,
    p_actor_window_seconds: REPORT_SUBMISSION_LIMITS.actorWindowSeconds,
    p_actor_max: REPORT_SUBMISSION_LIMITS.actorMax,
    p_ip_window_seconds: REPORT_SUBMISSION_LIMITS.ipWindowSeconds,
    p_ip_max: REPORT_SUBMISSION_LIMITS.ipMax,
  })

  if (error) {
    throw new Error("No pudimos validar el envío del reporte. Intentá nuevamente.")
  }

  if (data === "ok" || data === "duplicate" || data === "actor_limited" || data === "ip_limited") {
    return data
  }

  throw new Error("No pudimos validar el envío del reporte. Intentá nuevamente.")
}

/** Frees a claimed submission when report creation fails, so the user can retry it. */
export async function releaseReportSubmission(adminClient: SupabaseClient, submissionId: string) {
  const { error } = await adminClient
    .from("report_submission_attempts")
    .delete()
    .eq("submission_id", submissionId)

  if (error) {
    console.error("Could not release report submission claim:", error.message)
  }
}
