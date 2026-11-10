# `cancel-ready-made` suite — SAKANI-51392

Mobile automation for **[SAKANI-51392 — MOB [PROD] Update logic to prevent cancellation for readymade
booking with active financial application](https://jira.nhc.sa/browse/SAKANI-51392)** (linked: SAKANI-51838
bug, SAKANI-51290 Rebranding clone, SAKANI-51289 Web).

| | |
|---|---|
| **Jira** | SAKANI-51392 |
| **Suite** | `cancel-ready-made` → `.maestro/services/cancel-ready-made/` |
| **App / build** | `fi.iwa.sakani` · PRE-4.7.8-1308 (the build the fix was QA'd on) |
| **Device** | Pixel_8 emulator, Android 14, 1080×2400 · Maestro 2.9.0 |

## Prepared test data — RESERVED, never cancel / replace / pay / sign

Account **1119880062** holds the **Active** Ready Made booking **Target Segment test 22 / Apartment 190-113**,
unit code **03-01-0030-190-113** (booked 19/10/2026 by the former booking version of
`services/core/cancel ready made project.yaml`; since 21/10/2026 that Core flow is the block check on
1010040739's existing booking - PASS, see the project README).
Every flow here first proves that exact booking is still Active and stops with
`BLOCKED - TEST DATA` if it is not. Do not run the Core booking flow again for this account.

## Blocking prerequisite — Active MOH Financial Application

Not observable in the mobile app (19/10/2026). It must be confirmed in the backend (MOH
`CHECK_MOH_FIN_APP_STATUS` → `EXIST: 1`) and passed as an attestation:
`-e MOH_FA_CONFIRMED=true -e MOH_FA_EVIDENCE="<where verified>"`. Without it the flows stop with
**BLOCKED - TEST DATA / BACKEND PREREQUISITE** before **Cancel booking** is tapped. Financial Advisory is
a different thing and is never used as evidence.

## Flows

| Flow | Test case | Type | Taps on the booking |
|---|---|---|---|
| `cancel-ready-made-prepared-booking-active.yaml` | TC-001 | functional, read-only | none |
| `cancel-ready-made-booking-details.yaml` | TC-002 | functional, read-only | opens the card and its tabs only |
| `cancel-ready-made-e2e.yaml` | E2E-001 | e2e, safe end point | with the MOH gate: Cancel booking + reason; **never Confirm cancellation** |
| `cancel-ready-made-fa-blocks-cancellation.yaml` | TC-004 | functional, **writes-data**, double-gated | Confirm cancellation **once** (needs `MOH_FA_CONFIRMED=true` + evidence **and** `CANCEL_FINAL_APPROVED=true`); NOT EXECUTED |

Helpers (`subflows/`, never collected as tests): `verify-prepared-booking`, `open-prepared-booking-details`,
`moh-financial-application-gate`, `open-cancellation-reason` (stops before Confirm cancellation; stops on a
booking-fee confirmation). Shared helpers reused unchanged: `login`, `open-account-tab`,
`verify-signed-in-account`, `clear-overlays`. Reference image reused: `cancel/confirm-cancellation-enabled.png`.

**E2E-001** · Start: authenticated Sakani Home (1119880062) · End: reason selected and "Confirm
cancellation" enabled, immediately before the committing tap — or, without the MOH attestation, Booking
Details with Cancel booking offered (BLOCKED - TEST DATA / BACKEND PREREQUISITE).

## Running

Environment variables (all defaulted in each flow): `NATIONAL_ID` (1119880062), `READY_MADE_PROJECT`
(Target Segment test 22), `READY_MADE_UNIT` (Apartment 190-113), `BOOKING_UNIT_CODE` (03-01-0030-190-113),
`BOOKING_DATE` (19/10/2026), `READY_MADE_BLOCK/APARTMENT/BUILDING/FLOOR` (190/113/2/2), `CANCEL_REASON`
(Reject by bank), `MOH_FA_CONFIRMED` (false), `MOH_FA_EVIDENCE` (empty), `CANCEL_FINAL_APPROVED` (false).
Each flow signs itself in (cold start + shared `login.yaml`).

```bash
npm test -- --flows cancel-ready-made-booking-details
```

```bash
npm run test:service -- cancel-ready-made
```

```bash
npm test -- --flows cancel-ready-made-e2e --env MOH_FA_CONFIRMED=true --env "MOH_FA_EVIDENCE=<where verified>"
```

TC-004 changes business data if the block fails; run it only with written approval:

```bash
npm test -- --flows cancel-ready-made-fa-blocks-cancellation --yes-i-understand-this-changes-business-data --env MOH_FA_CONFIRMED=true --env "MOH_FA_EVIDENCE=<where verified>" --env CANCEL_FINAL_APPROVED=true
```

Report: built automatically after every npm run (`report-dashboard/dashboard.html`); evidence per flow in
`report-dashboard/maestro-output/<flow>/`.

## Notes

* The runner has no "blocked by test data" verdict: a gate stop is reported as FAIL, and its label
  (`BLOCKED - TEST DATA / BACKEND PREREQUISITE …`) is the classification.
* The block message wording was never observed live; TC-004 keys on "financial application" and
  proves the business outcome (booking still Active), and logs the live wording.
