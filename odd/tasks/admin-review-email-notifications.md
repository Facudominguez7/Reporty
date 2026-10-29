Objective: Notify every admin by email when a photo or report enters human review, including reports reaching the community rejection-vote threshold.
Branch: `main` (per user instruction; no feature branch) · Delivery: ask-on-risk · Test runner: Vitest (`npm test -- --run`).

## Specs

- **S1** The user requests: "Algo q quiero implementar ahora es lo siguiente, a todo correo q tenga rol admin, q le llegue un correo cada vez q una foto o un reporte necesite revision, creo q los reportes con tantos votos rechazados tambien necesitan revision. La idea es q les llegue correo a los admin asi se enteran, que tanto quilombo es? revisa". Implement emails for admin-role accounts on each photo and report review, including the rejection-vote review path. Use the existing Resend integration; no new email provider or paid plan is authorized.
- **S2** Resend currently advertises the Free plan as 3,000 emails/month and 100/day; each recipient counts against transactional email quota, even when several recipients share one API request. Keep send volume limited to one notification per admin per review and avoid repeated sends for the same event where the existing event lifecycle permits.

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1 | S1-S2 | inline | done | RED → GREEN; `df4377e` (`feat(notifications): alert admins on moderation reviews`) |
| T2 | S1-S2 | inline | done | Focused photo tests pass; `df4377e` (`feat(notifications): alert admins on moderation reviews`) |
| T3 | S1-S2 | inline | done | Full suite 414 passed/1 skipped; focused 59 passed; lint 0 errors (6 existing warnings); `tsc --noEmit` and `git diff --check` clean; `df4377e` (`feat(notifications): alert admins on moderation reviews`) |

## Log

- **L1** User: "Algo q quiero implementar ahora es lo siguiente, a todo correo q tenga rol admin, q le llegue un correo cada vez q una foto o un reporte necesite revision, creo q los reportes con tantos votos rechazados tambien necesitan revision. La idea es q les llegue correo a los admin asi se enteran, que tanto quilombo es? revisa"
- **L2** User authorized implementation: "bueno dale, vamos a implementar entonces."
- **L3** User constraint: "la idea tampco es pagar resend ni nada, osea seguir con plan gratuito mientras se pueda digamos"
- **L4** Resend pricing page reports Free at 3,000 emails/month and 100 emails/day (https://resend.com/pricing, checked 2026-10-29). Existing app uses Resend in `lib/notifications/report-notifications.ts`. Report reviews are created by `open_report_rejection_review_at_threshold` at 5 votes in `supabase/migrations/20261028114752_report_status_vote_reviews.sql`; photo REVIEW records live in `moderacion_imagenes`. Admin is role id 1; `profiles` holds private email contact fields. Design must avoid sending on initial transient row insertion before final photo classification.
- **L5** Resend pricing details clarify that each recipient counts toward the quota; a shared To header does not reduce consumption (https://resend.com/pricing). Since daily/monthly free quotas apply, notifications should be one message per admin per review and must not change report/photo processing outcomes when sending fails. The report workflow returns `needsAdminReview` whenever the live vote count is >=5, so it must distinguish the transition into review to avoid sending on later votes.
- **L6** User correction: "ok, no hace falta rama aparte, no te lo pedi". Returned to `main`; continue without a feature branch. No source changes were committed.
- **L7** T1 RED observed in `report-status-votes.test.ts` (fifth-vote notification absent); GREEN after implementation. Photo T2 RED observed in `imagenes-reporte.test.ts`; GREEN after implementation. Combined focused tests passed 59 tests including existing email template coverage. Email send failures are caught so user workflows still succeed.
- **L8** Added `sendAdminReviewNotificationEmail`: queries only `profiles.rol_id = ADMIN`, sends separate emails (one quota unit per recipient) with event/admin-scoped idempotency keys and a link to the relevant moderation queue. Report emails send only when the fifth rejection vote opens review; photo emails send only for persisted pending REVIEW outcomes. Full suite: 52 passed, 1 skipped; 414 passed, 1 skipped. `npm run lint`: exit 0, 6 warnings in unchanged files. `npx tsc --noEmit`: exit 0. `git diff --check`: clean.
- **L9** User authorized: "bueno, commitea lo q tenemos entonces hasta aca, y pushea a main". Commit `df4377e16909286b928122dacdce8ecf40bbb1cd` (`feat(notifications): alert admins on moderation reviews`) was assessed medium risk with `reviewDue=false` (`under_budget`) and pushed to `origin/main`; remote ref and local HEAD both report this exact SHA.
