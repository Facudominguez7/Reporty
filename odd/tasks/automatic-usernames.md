# Automatic usernames

Generate usernames for future registered accounts while preserving existing profiles.

## Specs

- S1: "bueno, ahora vamos con la generacion automatica para futuros usuarios"
- S2: "No, yo tomaria el nombre de google o parte del mail, no uno random"
- S3: "las cuentas actuales no te preocupes, fue mucho de prueba asiq no importa creo"

## Tasks

- T1 [S1-S3] Implement and locally test automatic username generation (local tests passed) | inline | commit: 4565f74
- T2 [S1-S3] Independently verify auth, uniqueness and existing-user behavior (passed with limits in log) | verifier | commit: 4565f74

## Log

- L1: bueno, ahora vamos con la generacion automatica para futuros usuarios
- L2: No, yo tomaria el nombre de google o parte del mail, no uno random
- L3: las cuentas actuales no te preocupes, fue mucho de prueba asiq no importa creo
- L4: Local SQL test observed RED and GREEN for email, simulated Google metadata, duplicate names, unsupported Google characters, guest promotion, and preservation of existing profiles. A disposable database test passed for simultaneous name collisions; all local integration data was rolled back. Production remains unchanged.
- L5: Independent review identified guest-to-registered conversion as an uncovered future-user path. Added generation only on conversion when the existing username is null, preserving assigned usernames and role promotion; observed RED then GREEN. Added tests for absent sources, privileged role retention and propagation of unrelated unique violations. Real Google OAuth remains untested locally.
- L6: Independent verification passed S1-S3 and reran the exact local test command. Follow-up parent tests passed for a privileged role during conversion and simultaneous conversion attempts. No production data or schema was changed.
