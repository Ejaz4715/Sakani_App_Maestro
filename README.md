# Sakani Maestro-Mobile

Mobile test automation for the Sakani app (`fi.iwa.sakani`) on Maestro 2.9.0. This is the single
source of truth for two executable categories: **Services** (the 10 Core app flows plus the
Jira-driven service suites) and **E2E** (the main booking/eligibility journeys).

The service suites were merged in on 11/10/2026 from the standalone project
`D:\Automation\Maestro with Jira`, which is kept unchanged as a temporary backup. Nothing in this
project depends on it.

| | |
|---|---|
| **App** | `fi.iwa.sakani` — validated on PRE-4.7.6-1283 (versionName 4.7.6) |
| **Device** | Pixel_8 emulator, Android 14 (API 34), 1080×2400 |
| **Maestro** | 2.9.0 |
| **Runner** | `report-dashboard/run-maestro.js` (one flow at a time, evidence per flow) |

## Structure

```
.maestro/
  services/                SERVICES (restructured 12/10/2026) - one folder per service:
    core/                    19 app flows (tag health-check; --service core) - see "Core" below:
                             account, view-booking, home, login, logout, marketplace, project,
                             search, unit, wallet,
                             edit-dashboard-remove-reset (writes-data, reversible),
                             baiti-purchase-consent, home-voucher-details,
                             home-voucher-redeem-type (added 14/10/2026), search-home-property,
                             search-home-service, search-home-support,
                             search-home-no-results-and-clear (added 15/10/2026),
                             Complete profile (writes-data; added 15/10/2026)
      core/subflows/           Core helpers (open-home-voucher, assert-voucher-details,
                               open-edit-dashboard)
    <jira-service>/          Jira service suites. Flow files have readable
                           kebab-case names (<service>-<what-it-proves>.yaml); the Jira test-case
                           ID stays in each file's header, name: and tags. Map:
                           docs/services/flow-file-map.json
    financial-advisor/       SAKANI-23300   TC-001..004 + E2E-001
    mortgage-calculator/     SAKANI-32007   TC-001 (Services route) + E2E-001 (unit route) only
    neighborhood-greetings/  SAKANI-38946 / SAKANI-29885   TC-007..009, TC-012..014 + E2E-001 (TC-001 Quick Access, TC-002 chooser, TC-003 catalogue, TC-004 card, TC-005 map covered by E2E-001; TC-006 History by TC-014; TC-010, TC-011 manual)
    real-estate-tax/         SAKANI-23459   TC-004, TC-005 + E2E-001 (TC-001..003 covered by E2E-001; TC-006 profile prompt manual)
    sakani-offers/           SAKANI-31966   TC-004, TC-005 + E2E-001 (TC-001 list, TC-002 details: E2E-001; TC-003 sheet: TC-004; static content and TC-006 creation date manual)
    cancel-ready-made/       SAKANI-51392   TC-001, TC-002, E2E-001 (gated) + TC-004 (writes-data, double-gated)
      <service>/subflows/      service-specific helpers (never collected as tests)
      <service>/README.md      suite README: safety rules, run notes, selector notes, history
  e2e/                     MAIN E2E journeys (5 flows) - CHANGE BUSINESS DATA, double-flag guarded:
                           full-journey, full-journey-paid, cancel-booking, check-eligibility, appeal-request
  subflows/                global shared helpers (login, overlays, NPS, navigation, session)
  scripts/                 JS helpers used by flows (hijri-age.js)
  test-data/               approved synthetic upload files (appeal PDFs)
  reference-screenshots/   pixel references used by assertScreenshot
report-dashboard/          runner, verdict rules, merge + HTML dashboard
docs/services/             flow file-name map (Jira ID -> readable name) and its one-off rename script
.env.example               every runtime variable, without secrets
```

### Shared helpers (`.maestro/subflows/`)

| Helper | Responsibility | Used by |
|---|---|---|
| `login.yaml`, `post-login.yaml` | the one authentication implementation (matches NATIONAL_ID on the Nafath screen; `post-login.yaml` may warm-relaunch the app once to recover - a documented exception to "no launch in helpers") | main app, services session |
| `verify-signed-in-account.yaml` | proves the signed-in account from the profile's own National ID | booking, cancel-booking, full-journey(-paid), appeal request |
| `clear-overlays.yaml`, `dismiss-nps.yaml` | first-run / promo / NPS surfaces | everything |
| `tap-until-destination.yaml` | navigate, surviving an NPS interruption | main app, mortgage, NG, RET, FA |
| `account-ready.yaml`, `open-account-service.yaml`, `open-account-tab.yaml` | Account tab navigation | main app; FA and RET use `account-ready` / `open-account-service` |
| `dismiss-keypad.yaml` | guarded keyboard dismissal (bare `hideKeyboard` acts as BACK) | financial-advisor, sakani-offers |
| `services-session.yaml` | sign in as the service-suite account before service flows | runner (services scope) |
| eligibility / registration / appeal helpers | main-app E2E only | `e2e/` |

When merged, the seven helpers present in both projects were **byte-identical**, so none was changed.
`dismiss-keypad.yaml` came from the services project; it is global because two services use it.
Service-specific helpers stay in `<service>/subflows/`.

## Tags

Classification comes from each flow's own `tags:` header, never from its folder (`report-dashboard/lib/tags.js`).

| Tag | Meaning |
|---|---|
| `health-check` | **Run Type: Health Check** - every functional / service-coverage flow: the 20 Core flows and every service-suite functional case (66 flows) |
| `release-readiness` | **Run Type: Release Readiness** - every end-to-end journey: the 5 service E2Es (they stay in their service suite) and the 5 Main E2E journeys (10 flows). A flow carries exactly one of the two Run Type tags |
| `service` | any service-suite flow (dashboard scope **Services**) |
| `critical`, `happy-path` | Main E2E grouping (dashboard scope **E2E**; a flow tagged `service` is never shown under E2E). Grouping only - the Run Type is `release-readiness` |
| `functional` / `e2e` | service functional case / service end-to-end journey |
| `<service-name>`, `sakani-<ticket>` | the suite and its Jira ticket |
| `known-defect` | encodes the requirement; **expected to fail** until the product is fixed. **No flow carries it since 10/11/2026** (the last one, Sakani Offers TC-006, was removed; known defects are tracked manually / in Jira). Exception: `services/core/wallet.yaml` fails by design only at its LAST step (WAL-010, defect D-31) and is not tagged, so excluding the tag never hides its passing cases |
| `needs-ineligible-account` | RET TC-005 - needs an account that has never run Eligibility |
| `needs-active-financial-application` | Core `cancel ready made project` (SAKANI-51392) - needs 1010040739 with an Active booking AND an Active Financial Application; opt-in only (`npm run test:sakani-51392`) |
| `needs-flexible-payment-booking` | `flexible-payment/flexible payment` (SAKANI-50700) - needs 1119880044's Active booking 01-01-0504-999-147 with the SAPA hidden schedule; opt-in only (`npm run test:sakani-50700`) |
| `writes-data` | FA TC-001..003 (real advisory submissions), FA E2E-001 (submits once when no advisory exists), RET TC-005 (can raise a real VAT request), NG TC-012/013 (real greeting / duplicate attempt), Core edit-dashboard-remove-reset (reversible), Core Complete profile (on an incomplete account: housing preferences, financial advisory); excluded unless explicitly confirmed |

## Safety rules

* **Main E2E** (`e2e/`) books, pays and cancels real bookings. The runner runs it
  only with `--include-e2e --yes-i-understand-this-changes-business-data`. That guard is in the
  RUNNER only: a plain `maestro test .maestro/e2e/<flow>.yaml` runs it with live defaults. Every
  journey that books, pays or cancels first proves the signed-in account from the profile's National
  ID (`verify-signed-in-account.yaml`) and stops on a mismatch.
* **`writes-data`** flows (FA TC-001/002/003 overwrite the beneficiary's stored advisory data; FA
  E2E-001: with `Purchasing power` shown it only verifies the existing advisory and its numeric
  purchasing power (no edit, no Submit); with none it taps Get recommendation, fills the form,
  certifies, submits exactly once, verifies the issued recommendation, taps Done and verifies
  Purchasing power on the reopened page - a real new advisory (not yet live-run in this form); RET
  TC-005 can raise a real VAT request if AC1 is not implemented). The
  runner drops them unless `--yes-i-understand-this-changes-business-data` is given, and refuses
  to run one named with `--flows` without it.
* **cancel-ready-made** (SAKANI-51392) uses the RESERVED Active Ready Made booking 03-01-0030-190-113
  of 1119880062 (Target Segment test 22 / Apartment 190-113) - never cancel, replace, pay or sign it. It
  stops with BLOCKED - TEST DATA / BACKEND PREREQUISITE until an Active MOH Financial Application is
  attested (`MOH_FA_CONFIRMED=true` + `MOH_FA_EVIDENCE`). Confirm cancellation is tapped only by TC-004
  (`writes-data`, also needs `CANCEL_FINAL_APPROVED=true`). Suite README:
  `.maestro/services/cancel-ready-made/README.md`.
* Core **`cancel ready made project.yaml`** (SAKANI-51392, replaced 21/10/2026; no longer books): as
  1010040739 (Active booking + Active Financial Application, precondition) it opens the existing Active
  booking, taps **Cancel booking once** and asserts the exact block sheet "Financial Application
  detected!" / "Sorry, you cannot cancel this booking as you already have a financial application.",
  then proves the booking is still Active. A normal cancellation screen stops it as FAIL; no reason,
  "Confirm cancellation" or "I understand" is ever tapped.
* **neighborhood-greetings** messages real residents if a greeting is sent. No flow sends: E2E-001
  stops on the review sheet. TC-008 taps the create-event `Send` only with every mandatory
  field empty, from a cold launch, and asserts nothing was sent.
* **real-estate-tax**: `Request a service` raises a real VAT request for an account without a
  certificate. E2E-001, TC-002 and TC-004 all fail closed on a profile certificate check before
  tapping it (TC-002's guard added 11/10/2026). TC-005 taps it on an account without Eligibility
  and is `writes-data`.
* Service suites run as **1000011487** (the project's standard PRE account). The runner signs
  in with `subflows/services-session.yaml` before the first service-SUITE flow. This is needed because
  the Core flows sign in as other accounts, and `services/core/logout.yaml` signs out.

## Core suite (20 flows)

`.maestro/services/core/` - each flow signs itself in (or runs as "Any"), from a cold start. Dashboard:
Services -> Core.

| Flow | Dashboard name | Coverage |
|---|---|---|
| account | account | Account services, read-only |
| view-booking | view-booking | My Bookings Active / Completed / Cancelled tabs open (view-only, any account) |
| home | home | Home tabs and Quick Access, featured unit opens Unit Details, Back to Home, guest vs signed-in greeting, tabs after sign-in |
| login / logout | login / logout | Authentication, sign-out |
| marketplace / project / search | marketplace / project / search | Explore, project, Explore-tab location search (run as "Any") |
| search-home-property | Home Search - Property | HOME search bar -> property term -> matching project -> its project page |
| search-home-service | Home Search - Service | Partial keyword -> the service -> its service sheet (CTA never tapped) |
| search-home-support | Home Search - Support | Support term -> contact-channels FAQ (Customer Care number) -> expands in place |
| search-home-no-results-and-clear | Home Search - No Results and Clear | No-result state; clear resets to Recent searches; recent search re-runs; Cancel to Home |
| unit | unit | Unit Details "Reserve unit" for an eligible account |
| wallet | wallet | Wallet / preferences / mortgage validation; ends on the D-31 guard (fails by design) |
| edit-dashboard-remove-reset | Edit Dashboard - Remove and Reset | First active widget captured -> Remove once -> same widget under Deactivated widgets -> Confirm -> reopen -> Reset -> Confirm (writes-data, reversible) |
| baiti-purchase-consent | Baiti - Purchase Consent | Home Baiti card -> Jahez "Complete your purchase" sheet; pre-filled data; Continue gated on both consents (never tapped) |
| home-voucher-details | Home Voucher - Details | Voucher opened FROM HOME by title; details match the card; Back to Home with the same card shown (view-only, no voucher action tapped) |
| home-voucher-redeem-type | Home Voucher - Redeem Type | QR voucher opened from Home; details match; "Redeem now" offered (never tapped) |
| Complete profile | Complete Profile | **Core / Health Check / writes-data.** State-aware: reads Profile completion from a loaded Home and completes only the missing items (House preferences: Save once, only with an explicit `PREF_CITY` - no default, else stops BLOCKED - TEST DATA before saving; Financial advisory: one submission), then proves both Completed after a relaunch. Eligibility is not covered (own E2E flow). Excluded from the default safe run |

**Current result** (consolidated from existing run evidence, nothing re-run; raw evidence not kept in the repository): 16 PASS, 3 FAIL -
home and unit BLOCKED - TEST DATA (no featured-unit content on PRE), wallet FAIL - PRODUCT DEFECT D-31
at its final step only. Complete profile is not part of that consolidation; its own status is below.

**Complete Profile coverage** (account 1000011487):
- Already-complete profile path: **PASS** (run4, after a cold boot; 0 Save / 0 Submit).
- Housing Preferences completed state: **validated**. Run2 completed it once (Save x1, "You have registered interest!"), and it was confirmed read-only afterwards.
- Eligibility completed state: **validated** (Account: "Eligibility checker status / Eligible").
- Financial Advisory completed state: **validated** (existing advisory dated 12/10/2026, purchasing power 70,009 SAR).
- Missing Eligibility branch: **BLOCKED - TEST DATA** until approved real family-member PRE data exists. Family National IDs are never generated.
- Missing Financial Advisory branch: **not yet fully exercised** (needs an account without an advisory).
- The House preferences confirmation assertion has not yet executed live. Its wording matches the run2 success screen.

**Open findings (not confirmed defects):**
- Complete Profile - the Preference form's Budget range maximum defaults to "350,000,005,513,216" SAR.
  POTENTIAL PRODUCT DEFECT / BUSINESS CLARIFICATION (no requirement defines the expected maximum).
- Baiti - the Home entry opens the third-party Jahez purchase / account-opening consent directly;
  "Continue" (account creation, data shared with Jahez) is intentionally never executed. BUSINESS
  CLARIFICATION.
- Home Vouchers - the catalogue and its ORDER are dynamic (Admin-managed; order changed between
  launches), so the flows select a voucher by its visible title (`HOME_VOUCHER_TITLE`), never by
  position or discount; change the config, not the steps, when Admin changes the vouchers. "Redeem
  now" stays unexecuted (may consume the voucher). The QR voucher's missing hero image is Admin
  content data, not a confirmed application defect; the reported "first voucher does not work" did
  not reproduce (it opens its details on the first tap).
- Home search - the same service is listed several times under Services ("Mortgage Calculator" x5,
  "Land support" x5). POTENTIAL DEFECT (could be duplicate catalogue content).
- Home search - "support" search returns FAQ answers (contact channels) only; no term opens the Help &
  Support screen or Contact Us, although the placeholder promises support. BUSINESS CLARIFICATION.
- Home search - the FAQ "What are the communication channels with Sakani?" is listed twice, with
  different answers. POTENTIAL DEFECT / BUSINESS CLARIFICATION.

**Home Global Search coverage** (the Home bar "Looking for a property, service, or support?" - distinct
from `search`, which covers the Explore-tab location search): property search, service search (partial
keyword), support/FAQ search, the no-results state and clear/reset (plus recent searches and Cancel back
to Home). Search terms are configurable per flow (`SEARCH_*_TERM` / `SEARCH_*_RESULT`). Result:
all four PASS on their first run, and `search` PASS in the same run.
Remaining gaps: Arabic search, a Profile-type result, "Show more result" paging, Trending Services
shortcuts, guest (signed-out) search, slow-network loading/recovery.

## Running

Prerequisites: an emulator or device that is ready in `adb devices`, the app installed, Node.js, Maestro 2.9.0 on PATH.
Only one Maestro session can drive a device at a time.

| Goal | Command |
|---|---|
| See what would run (no device needed) | `npm run list` (everything), or `node report-dashboard/run-maestro.js --list <flags>` |
| Core (default): 17 safe flows; `edit-dashboard-remove-reset` (writes-data, reversible) only with `--yes-i-understand-this-changes-business-data` | `npm test` or `npm run test:services:core` |
| One Core flow | `npm run test:services:core -- --flows home-voucher-details` |
| SAKANI-51392 cancel block (dedicated data, opt-in) | `npm run test:sakani-51392` |
| Consolidated report from existing evidence (runs nothing) | `MERGE_FROM=<folder of per-flow evidence> node report-dashboard/merge-results.js && node report-dashboard/generate-dashboard.js` |
| Main E2E (changes business data) | `npm run test:e2e`, or one journey: `npm run e2e:full-journey` etc. |
| All services (Core + every suite) | `npm run test:services` |
| One service | `npm run test:service -- mortgage-calculator` |
| Service functional cases only | `npm run test:services:functional` |
| Service E2Es only | `npm run test:services:e2e` |
| Full safe project (all Services; Main E2E excluded) | `npm run test:consolidated` |
| One flow | `npm test -- --flows wallet` or `npm test -- --flows mortgage-calculator-happy-path` |
| Exclude expected failures | append `--exclude-tags known-defect` |
| Override a variable | append `--env PRICE=1500000` (forwarded to maestro as `-e`) |

`npm test` and every `test:*` / `e2e:*` script run through `run-and-report.js`, which always builds the
report after a run - including a failed one - and never republishes old results when nothing ran
(for example with `--list`).

Runner flags (`node report-dashboard/run-maestro.js ...`): `--scope services|e2e|all`
(comma-separated), `--service <a,b>` (a folder name under `.maestro/services/`, e.g. `core` or `mortgage-calculator`), `--flows <a,b>`, `--include-tags <a,b>` (any of),
`--exclude-tags <a,b>` (none of), `--env KEY=VALUE`, `--device <serial>`, `--list`,
`--no-session-setup`, `--include-e2e --yes-i-understand-this-changes-business-data`.
`test:services` / `test:service` / `test:consolidated` exclude `needs-ineligible-account`. `npm test`, `test:services:core`, `test:services`, `test:service` and `test:consolidated` also exclude `needs-active-financial-application` (run it with `npm run test:sakani-51392`). `test:services`, `test:services:functional`, `test:service` and `test:consolidated` exclude `needs-flexible-payment-booking` (run it with `npm run test:sakani-50700`).

You can also run a single flow directly with Maestro, e.g.
`maestro test .maestro/services/mortgage-calculator/mortgage-calculator-happy-path.yaml`.
Service flows assume an authenticated suite session; prepare one with
`maestro test .maestro/subflows/services-session.yaml`.

### Runtime variables

Every flow declares its own non-sensitive defaults. Overridable defaults use the guarded idiom
`'${typeof X === "undefined" ? "default" : String(X)}'` (some service flows use the equivalent
`... : X}` form). On Maestro 2.9.0 a plain literal in `env:` silently beats both `-e` and a caller's
`runFlow env:`. Both guarded forms honour the default, `-e` and a caller's `runFlow env:`, and keep
values such as `0555555555` as strings (pure-JS probe on the device, 11/10/2026). The full list is in
[`.env.example`](.env.example). Never commit real National IDs, OTPs, card data or tokens. The only
committed values are approved PRE fixtures: test accounts, the fixed PRE OTPs and the payment
gateway TEST card in `full-journey-paid.yaml`.

## Reports

Each run writes per-flow evidence to `report-dashboard/maestro-output/<flow>/` (raw log, exit code,
debug artifacts). `merge-results.js` re-derives every verdict from those raw logs and writes
`test-results/merged-results.json`. A copy is archived in `report-dashboard/test-reports-history/`.
`generate-dashboard.js` renders `report-dashboard/dashboard.html`, which has two scopes:
**Services** and **E2E**. The Suite column shows `Core` for the 10 Core flows, the service's
readable name (for example Real Estate Tax) for a suite flow, or `E2E`. Results recorded before the
12/10/2026 restructure are shown under their current group. Service test titles come from each flow's
`name:` with Jira IDs removed (`lib/display-names.js`). The Jira ID stays internal only (file
header, result JSON, logs).

Verdict rule (`lib/verdict.js`): PASS only with exit code 0 **and** no FAILED step. Environment
deaths are BLOCKED_ENVIRONMENT, and a missing exit code is UNRESOLVED - neither is ever reported as a
product failure.

## Validation status

See the section below, updated with the post-merge execution results. Results recorded inside each
service README and in `docs/services/` are **historical** (06–08/10/2026, standalone project) and
are not post-merge evidence.

<!-- VALIDATION-RESULTS -->
### Post-merge validation - 11/10/2026, PRE-4.7.6-1283, emulator-5554

This was a minimum representative run that proves the merge, not a full run. Raw logs, exit codes and verdicts are not kept in the repository.

| Area | Executed | Result | Notes |
|---|---|---|---|
| financial-advisor | E2E-001, TC-004 | 2 PASS | E2E-001 here is the former submit-free version (since replaced by the two-branch `writes-data` E2E). TC-001..003 (`writes-data`) not run: no approval |
| mortgage-calculator | TC-001, E2E-001, TC-002B | 3 PASS | TC-002B (D-11 guard) **passes** once the radios are really left unanswered, so D-11 is withdrawn |
| real-estate-tax | TC-003, TC-004 | 1 PASS, 1 FAIL | TC-004: its certificate guard and profile route pass, then the **Services catalogue renders empty** (seen twice). Classified ENVIRONMENT ISSUE, UNRESOLVED. The final review reproduced it straight after a cold start with no RET step (probe A), so the whole Services tab renders blank on this build/environment. The cause is not proven |
| sakani-offers | TC-001, TC-004 | 1 PASS, 1 FAIL | TC-004: the voucher-list support icon is **not rendered** (absent from the hierarchy, seen twice). Not migration. Classified POTENTIAL DEFECT / TEST DATA ISSUE, UNRESOLVED: Join Us access depends on account type (SAKANI-36124), and the type of 1000011487 is unverified. TC-003 uses the same icon and is affected too |
| neighborhood-greetings | TC-001 | PASS | after a helper fix: a first-entry "Connect with your community" sheet hid the main screen |
| Core service flows | `services/core/login.yaml` | PASS | shared auth / overlay / NPS helpers |
| Original main E2E | not executed | — | changes business data (booking, payment, cancellation, registration). Flows and helpers are byte-identical to the pre-merge backup |

Environment events: the app crashed natively in its render thread (SIGABRT) and the emulator ran out of memory
(lowmemorykiller). Both were fixed by a cold boot, and both were reported UNRESOLVED / BLOCKED, never FAIL.

### Final pre-APK review - 11/10/2026

Targeted non-destructive validation of the review's changes.
Results: identity-gate harness PASS · SO voucher-list (top-level cold start) PASS · RET TC-002 new certificate guard
PASS, then the flow is blocked by the blank Services tab (ENVIRONMENT, unresolved; CTA never tapped) · env-override
probes as documented above · `check-syntax` 97/97 OK.

### Current executable inventory - 15/10/2026 (from discovery: `npm run list` with every scope and flag)

**76 executable flows** (71 + 4 Home-search Core flows + Complete profile, all added later on 15/10/2026), no duplicates, no helper collected: Core 20 · Financial Advisor 5 ·
Mortgage Calculator 17 · Real Estate Tax 7 · Sakani Offers 7 · Neighborhood Greetings 15 · Main E2E 5.
Since the 63-flow inventory of 11/10: +3 Neighborhood Greetings (send greeting, one greeting per
neighbour - both writes-data - and populated History, 13/10/2026) and +5 Core Home-feature flows
(14/10/2026).

### New APK - PRE-4.7.8-1308, 11/10/2026 (fresh validation)

All 63 flows: **38 PASS · 6 FAIL · 14 BLOCKED / needs user intervention · 5 EXCLUDED** (0 unaccounted; account unblocked 12/10).
Blocking finding: the Services tab renders blank on PRE, plus persistent loaders on search and wallet. Automation fix: the NG
compose swallowed-tap guard.
