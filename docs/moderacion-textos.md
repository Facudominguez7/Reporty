# Contextual text moderation (T3)

## Status and integration contract

The server-only classifier now guards the current report and pet creation workflows.
Each workflow reserves the separate atomic T4 text budget before classification, and
only APPROVED continues to creation/photo handling/points. Reservation failure or any
non-APPROVED classifier result blocks the workflow fail-closed. No reservation is
released or refunded, including after timeout. This protects these two workflow paths
only; it is not global database enforcement and cannot prevent a caller from bypassing
these workflows through another path. Authorized administrative corrections remain a
human-trusted scope and are not classified by this guard.

Import `moderateText` and optionally `TextModerationInput` / `TextModerationResult`
from `lib/moderation/textos.server.ts`. The function accepts unknown runtime input:

- Report: `{ tipo: 'reporte', categoria, titulo, descripcion }`.
- Pet: `{ tipo: 'mascota', tipoAnimal, descripcion }`.

Use trusted server-resolved category/type context, not an unchecked display label.
Only `result.decision === 'APPROVED'` permits publication of the same validated text.
`REJECTED`, `REVIEW`, and `UNAVAILABLE` all block publication and carry a fixed Spanish
`error` for existing workflow UI. Both report and pet submission failures use floating
Sonner alerts; field validation and photo moderation keep their existing UI.
Moderation decisions show the neutral heading
`Revisá el texto`; verification failures use `No pudimos verificar el texto` with a
retry prompt. REVIEW is uncertainty, not a pending human queue.
Authorized admin corrections remain the existing trusted-human path, outside T3.

## Safety and bounded requests

Report category: 1–80 UTF-16 code units; title: 3–120; description: 10–5000.
Pet type: `perro`, `gato`, or `otro`; description: 1–5000.
Minimum lengths also apply after whitespace trimming, but the actual text is never
trimmed, truncated, or rewritten before classification. Oversized input fails closed.
Only the listed fields enter the JSON data message: extra runtime identity, phone,
and coordinate fields are discarded. This is not PII redaction inside free text;
do not add contact fields to descriptions or expand the payload with record spreads.

A fixed system prompt separates instructions from untrusted user data and evaluates
context, off-topic trolling, directed insults, and obscenity. Legitimate animal
injuries, spelling mistakes, and regional expressions are not keyword bans.
The pet-specific instructions explicitly accept brief sightings such as “perro negro
solo en la calle, parece hembra” and “gato suelto en la calle, macho”, without requiring
certainty about sex, a long narrative, or an explicit request for help. This is prompt
guidance, not a bypass of moderation or proof of real-model accuracy.
It cannot establish factual truth or guarantee immunity to prompt injection.
The Bache / “Cola rota” / “terremoto bailable” example is an expected off-topic case;
a pet's broken tail is legitimate injury context, not automatically obscene.

The fixed model is `@cf/meta/llama-3.1-8b-instruct-fp8`, with `max_tokens: 96`,
`temperature: 0`, `stream: false`, no retries, and a twenty-five-second local deadline including context
acquisition. Late context acquisition cannot start inference. A timeout does **not**
prove inference cancellation: never refund an ambiguous reservation.
Strict local JSON validation accepts only APPROVED/RELEVANT,
REJECTED/(OFF_TOPIC|DIRECTED_INSULT|OBSCENE), or REVIEW/UNCERTAIN.
Extra decision fields, invalid pairings, malformed output, missing bindings, and
provider failures cannot approve; arbitrary provider text is never shown or logged.

## Runtime binding and activation

`wrangler.jsonc` now declares the Workers AI `AI` binding with `remote: true`, which
lets OpenNext local development use Cloudflare's remote AI service. The classifier
still returns `UNAVAILABLE` unless the server environment explicitly contains
`TEXT_MODERATION_FREE_BUDGET_CONFIRMED=true`; this gate is intentionally not set in
Wrangler, so adding the binding alone does not activate model calls. Setting the gate
for a manual test will make real requests and consume the account's Workers AI quota.
The account's Workers Free plan was confirmed by the user; an application-local cap
still cannot guarantee account-wide zero cost if other consumers share that quota.

`next.config.mjs` initializes OpenNext bindings in development. No deployment or live
inference was performed. Generated `cloudflare-env.d.ts` types were not regenerated:
this checkout's `cf-typegen` script invokes Wrangler, which writes logs to its global
configuration directory, outside the authorized workspace. The runtime continues to
use the classifier's narrow local `AiBinding` contract; no generated type file was
hand-authored.

Report category context is resolved server-side from `categorias.nombre` using the
validated `categoriaId`; client display labels are not used. Pet context uses the
validated `tipoAnimal` and description. These guards run before report insertion and
before pet photo publication/upload. Report reverse geocoding also starts only after text
approval, so rejected submissions do not send their coordinates to that external service.

## Server diagnostics

Failures emit `[text-moderation]` warnings in the server terminal. Only fixed stage
codes are logged, never submitted text, identities, tokens, raw provider output or
exception messages. Provider errors additionally log numeric HTTP status/API code when
available as numeric properties. Invalid decisions log only boolean structural flags
(extra fields, decision field, reason field) and a fixed shape label, never field values. `CONFIG_DISABLED`, `CONTEXT_ERROR`, `BINDING_MISSING`,
`PROVIDER_ERROR`, `TIMEOUT`, `INVALID_INPUT`, `INVALID_ENVELOPE`, `INVALID_JSON` and
`INVALID_DECISION` identify classifier failures. Workflow warnings additionally use
`mascota` or `reporte` with `BUDGET_RPC_ERROR`, `BUDGET_DENIED` or
`BUDGET_INVALID_RESPONSE`; reports also log `CATEGORY_LOOKUP_FAILED`.
`BUDGET_DENIED` does not distinguish the global cap from the per-user cap.
A deadline returns `UNAVAILABLE/TIMEOUT`, propagated as `errorKind: timeout` in both
workflows. Both forms display “La verificación tardó demasiado” / “Intentá nuevamente.”
Other failures keep their existing messages. Publication still fails closed; a timeout
never retries or refunds the attempt.

## Evidence and limitations

Deterministic tests mock `getCloudflareContext` and AI; no live inference is performed.
They cover decision pairing, payload privacy, instruction isolation, input boundaries,
malformed output, provider/context failures, disabled gating, and late completions.
Mock outcomes are not model-accuracy evidence. Bounded synthetic live cases and
independent risk review remain pending; no browser verification was performed.

Parent-provided official references:
- https://developers.cloudflare.com/workers-ai/configuration/bindings/
- https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/
- https://developers.cloudflare.com/workers-ai/features/json-mode/

The request deliberately omits `response_format`: the general JSON Mode supported-model
list omits this FP8 variant, and the user observed PROVIDER_ERROR after the schema
option was added. This is not proof of the provider's exact failure reason; removing
the unconfirmed option restores the ordinary generation request. Explicit JSON examples,
temperature zero, and strict local validation remain. Unknown fields and inconsistent
pairs still block publication; no approval normalization, retry, or extra call is added.
Structured objects and serialized JSON responses both undergo the same validation.
The model page lists planned deprecation on 2026-11-20; no model switch was made here.
