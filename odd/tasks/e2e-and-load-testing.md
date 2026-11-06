# E2E and load testing (#144)

Objective: automated end-to-end tests of Reporty's main flows, email checks without real sends, and a load test of the public pages, all against the local Supabase stack.
Branches: `chore/e2e-0N-*` (`test/…` is impossible: a remote branch named `test` exists), one per slice · Delivery: ask-on-risk → user chose stacked PRs to main (forecast ~990 authored lines, over the 400-line budget) · Test runners: Vitest (`npx vitest run`) and Playwright (`npx playwright test`, system Chrome).

## Specs

- **S1** Issue #144: "Realizar pruebas de carga, correos, imágenes y funcionalidades principales". The user accepted ("si") this approach: "Pruebas automáticas de punta a punta de los flujos principales", "Verificación de los emails, sin mandar correos reales", "Una prueba de carga sobre las páginas públicas", "todas contra el Supabase local y sin tocar producción".
- **S2** E2E suite, committed to the repo, run with Playwright on the installed Google Chrome (`channel: "chrome"`, no browser downloads) against `next build` + `next start` with the local Supabase stack. Assumption: the main flows are:
  - public browsing: map, report list with filters, report detail;
  - accounts: sign-up with email confirmation, login, logout, password recovery;
  - reports: create one as a registered user and as a guest, delete your own report;
  - community: comment, vote, admin state change.
- **S3** Images: a heavy photo uploaded through the report form is stored at 100 KB or less with its thumbnail, and shows on the report detail.
- **S4** Emails, with no real sends: auth emails are read from the local Mailpit; notification emails (new comment, state change) are captured by a local fake of the Resend API through `RESEND_BASE_URL`.
- **S5** Load test of the public pages (`/`, `/mapa`, `/reportes`, a report detail, `/sitemap.xml`) against the local production build, with the script committed and the results recorded. Assumption: k6 through Docker (`grafana/k6`), so no new npm dependency. Production is never load-tested without explicit authorization.
- **S6** Test data: every test creates its own users and reports and hard-deletes them afterwards (rows, auth users, storage objects). Pre-existing rows are never touched.
- **S7** Docs: how to run the E2E suite and the load test.

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1 | S2, S4, S6 | inline | done (commit "test(e2e): set up Playwright against local Supabase…" on chore/e2e-01-setup) | Playwright setup, web server, data factory and cleanup, fake Resend; public-browsing spec (Mailpit client moves to T2, its first user) |
| T2 | S2, S4, S6 | inline | done (commit "test(e2e): cover sign-up, sign-in, sign-out and password recovery" on chore/e2e-02-accounts) | account specs: sign-up + confirmation, login, logout, recovery; Mailpit client |
| T3 | S2, S3, S6 | inline | done (commit "test(e2e): cover report creation with photos, guest reports and deletion" on chore/e2e-03-reports) | report specs: citizen with a heavy photo (stored ≤100 KB + thumbnail, shown on the detail), guest via "Continuar como invitado", owner deletes own report |
| T4 | S2, S4, S6 | inline | done (commit "test(e2e): cover community interactions and notification emails" on chore/e2e-04-community) | community specs: comment + owner notification, repaired vote + notification, admin state change + email; persisted UI checked after reload; full suite 14 passed |
| T5 | S5 | inline | done (commit "test(load): add a k6 load test of the public pages" on chore/e2e-05-load) | `scripts/carga/paginas-publicas.js` + `scripts/carga/ejecutar.mjs` (`npm run test:load`); results in L10 |
| T6 | S7 | inline | folded | docs ship with the slice they document: E2E docs in PR 1, load-test docs in PR 5 |

## Slices (stacked PRs to main)

| PR | Branch | Tasks | Forecast | Depends on |
|----|--------|-------|----------|------------|
| 1 | `chore/e2e-01-setup` | T1 + E2E docs | ~370 | none |
| 2 | `chore/e2e-02-accounts` | T2 | ~150 | PR 1 |
| 3 | `chore/e2e-03-reports` | T3 | ~180 | PR 1 |
| 4 | `chore/e2e-04-community` | T4 | ~200 | PR 1 |
| 5 | `chore/e2e-05-load` | T5 + load-test docs | ~90 | none |

Each branch starts from `main` once its parent merged, or from the parent branch while it is still open (then it is rebased onto `main` after the parent merges).

Route evidence: one writer (the parent) works inline; no Writer trigger (no parallel units with disjoint surfaces, no context backstop).

## Log

- **L1** (2026-10-23) User: "con que seguimos" → recommended #144 with the three-part approach (automated end-to-end tests of the main flows, email checks without real sends, a load test of the public pages, all on the local Supabase). User: "si".
- **L2** Findings: no Playwright, load tool or CI exists. `resend@6.20.0` reads `RESEND_BASE_URL`. Local Mailpit at `http://127.0.0.1:54324`. `next build` uses `--webpack`. `.env` points to production, so every run overrides the `NEXT_PUBLIC_SUPABASE_*` values and `RESEND_API_KEY`.
- **L3** User asked "por que calculas tantas lineas?" and "osea son todos tests": explained the per-task estimate and that no app code changes (only an accessibility fix if a test finds an unlabeled control, reported separately).
- **L4** User: "prs encadenadas a main". Next step: T1 on `chore/e2e-01-setup`.
- **L5** 2026-10-23 T1 verified: `npx playwright test` 4 passed twice (map markers, list search → detail, state filter, not-found); first run failed on 2 selectors (the detail page title is not a heading; "Reporte no encontrado" also matches `<title>`), fixed. Vitest 146 passed, tsc clean, eslint clean on `e2e/`. No `e2e-` users, reports or storage objects left in the local DB. Docs: README "Pruebas", `npm run test:e2e`, `.gitignore` for Playwright output. Next: PR 1 push/PR after user approval, then T2 on `chore/e2e-02-accounts`.
- **L6** 2026-10-23 PR 1 opened as #166 on `chore/e2e-01-setup` (a remote branch named `test` makes `test/*` names impossible). T2 verified on `chore/e2e-02-accounts`: full suite 8 passed (4 accounts + 4 public). Auth emails are read from Mailpit; their links point to the stack Site URL (port 3000), so tests open the same path on port 3100; no config change was needed. Logout redirects `/dashboard` to `/auth?next=%2Fdashboard`. No `e2e-` users, reports or Mailpit messages left. eslint and tsc clean. Next: T3 on `chore/e2e-03-reports`.
- **L8** T4 verified on `chore/e2e-04-community`: full Playwright suite 14 passed, Vitest 146 passed, tsc and ESLint clean. First focused run: 2 passed, comment failed on ambiguous text during confirmation-dialog teardown; fixed by waiting for dialog dismissal and cleared textarea. Disposable administrator promoted by exact test-user UUID only; notifications captured through the fake Resend API and checked for recipient, subject, content and report link. Reload verifies comment and closed report persistence. Local API cleanup audit: zero test profiles, reports and Auth users remain. No application/UI code changed; no meaningful behavior-change RED or differential check applies. Native assessment unavailable (untracked new spec requires an explicit declaration); no native review verdict claimed. T5 remains separate and is not started by this T4 authorization. Unrelated `skills-lock.json` change preserved; no push or PR.
- **L7** 2026-10-23 PR 1 #166 merged; PR 2 opened as #167 after rebasing onto `main`. T3 verified on `chore/e2e-03-reports`: full suite 11 passed. The heavy photo is a 4000×3000 JPEG (>1 MB) drawn on a canvas in the browser, so no binary is committed; the stored photo and its thumbnail are each ≤100 KB and the detail image loads. Without a session `/reportes/nuevo` redirects to `/auth`, and the guest path is "Continuar como invitado" (`?modo=invitado`). Guest identities are tracked through their report and deleted. No `e2e-` users, anonymous users, reports, storage objects or Mailpit messages left. eslint and tsc clean. Next: T4 on `chore/e2e-04-community`.
- **L9** 2026-11-06 User: "que onda la 144" → T5 was the only pending slice (PRs #166–#169 merged); user: "si". Load test written in Spanish per AGENTS.md: k6 1.3.0 through Docker (`--network host` on Linux, `host.docker.internal` elsewhere), production build on 127.0.0.1:3100 against local Supabase, fake Resend key pointed at a closed loopback port, GA off. Thresholds: errors <1 %, checks >99 %, p95 <2 s overall and per page.
- **L10** 2026-11-06 Results (20 VUs, 20 s ramp + 1 min plateau + 10 s ramp-down, local machine, 42 reports in the local DB): 1536 requests, 0 failed, all checks passed, exit 0. p95 per page: inicio 6.55 ms, mapa 21.86 ms, reportes 22.62 ms, detalle 31.31 ms, sitemap 5.93 ms; overall p95 23.88 ms; 70 MB received. Not production numbers: no network latency, local Supabase. First run was invalid: local Kong had no published host port (`docker port` empty, API unreachable), so pages returned 200 without data and the detail page was silently skipped; fixed with `supabase stop` + `supabase start` (data kept; `tailscale serve` on 54321 turned off and restored around it). The runner now aborts when the local Supabase API does not answer, and the script fails when the sitemap has no report instead of skipping the detail page (observed: the setup fails with the `npm run db:setup` hint).
- **L11** 2026-11-06 Native review `review-efbdece72ea0771f` (resilience, reliability) required one correction: R4, the runner reused any server answering on port 3100 without proving its target. Fixed: the runner no longer reuses servers and aborts when the port is busy; verified with a dummy server on 3100 (exit 1, "El puerto 3100 ya está ocupado…").
- **L12** 2026-11-06 Native review `review-efbdece72ea0771f` approved after the R4 correction (`b84e19b`), acknowledged and authority burned. Non-blocking advisories for later work: the API guard only catches refused connections, `kill` on an already-gone process group can throw, an interrupted run (Ctrl+C) may orphan the server, server output is discarded, a stale `resumen.json` can be reported after an early k6 failure, the checks only assert status 200, and probes have no timeout.
