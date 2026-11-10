# `Real-estate-tax` suite — SAKANI-23459

> Migrated on 11/10/2026 from the standalone services project into `Maestro-Mobile` (`.maestro/services/real-estate-tax/`).
> Shared helpers now resolve to the project-wide `.maestro/subflows/`. Execution results in this file are
> **historical** (PRE-4.7.6-1283, 06–08/10/2026), not a post-migration run — see the project
> [README](../../../README.md) for current validation and the consolidated runner commands.

Mobile automation for **[SAKANI-23459 — Enhance VAT journey: Add Eligibility precondition in the
VAT journey](https://jira.nhc.sa/browse/SAKANI-23459)**, built inside the existing Sakani Maestro
project.

| | |
|---|---|
| **Jira** | SAKANI-23459 |
| **Suite** | `Real-estate-tax` → `.maestro/services/real-estate-tax/` |
| **Web reference** | <https://pre-sakani.housingapps.sa/services/real-estate-tax-incurred-service> |
| **App** | `fi.iwa.sakani` |
| **Build validated** | PRE-4.7.6-1283 (versionName 4.7.6) |
| **Device validated** | Pixel_8 emulator, Android 14 (API 34), 1080×2400 |
| **Maestro** | 2.9.0 |

> **These flows are read-only, except TC-005 (see below).** Nothing here submits a VAT request,
> issues a certificate, downloads one, or writes to the beneficiary record. E2E-001 taps
> "Request a service" once, TC-004 twice; for an account that already holds a certificate that CTA
> only routes to the existing record. **Both first prove, from the profile page, that the
> certificate already exists** (fail-closed guard), so the CTA
> cannot do anything but route. TC-005 taps it on an account WITHOUT Eligibility and is tagged
> `writes-data`, so the runner refuses it without explicit confirmation.
> Neither flow taps **Download** (it pulls a government document carrying personal data) or
> **"Inquiring about a certificate"** (it takes a national ID). No approval is needed to run this
> suite.
>
> ⚠️ **For an account with no certificate, "Request a service" raises a real VAT exemption request
> against an external government integration.** Never point TC-004 or E2E-001 at such an account —
> E2E-001's precondition guard fails closed if you do.

## Execution status (13/10/2026, PRE-4.7.8-1308)

TC-001, TC-002, TC-003, TC-004 and E2E-001 PASS (1000011487; the Services tab works again). TC-006 is BLOCKED -
TEST DATA: fixture 1012204739 holds an issued certificate. TC-005 was NOT EXECUTED - SAFETY. The two
beneficiaries show the same certificate number, so the shared-certificate data issue is still present.

**TC-001 removed 10/11/2026.** The standalone service-page flow (`real-estate-tax-service-page.yaml`)
was deleted. Service entry and the `Request a service` CTA are covered by E2E-001: it opens the VAT
service with `subflows/open-vat-service.yaml`, asserts `Request a service`, taps it and continues the
certificate flow. The page's static content (`Real estate tax` title, service description,
Beneficiaries / Citizens, Service Channels, Services Fees) is now **manual QA scope**. TC-001's
result above is historical.

**TC-002 removed 10/11/2026.** The standalone eligible-user flow
(`real-estate-tax-eligible-user-not-blocked.yaml`) was deleted. Positive eligible-user access is
covered by E2E-001: with an issued certificate it opens the VAT service, taps `Request a service`,
is not blocked (`Missing some information` absent) and reaches `First Home VAT Exemption` with the
issued certificate. Now **manual QA scope**: the explicit Account check that `Eligibility checker
status` reads `Eligible`, and the positive check that `Please check your Eligibility status first` is
absent. Negative eligibility blocking stays automated in TC-005
(`real-estate-tax-submit-request-with-not-eligible-user.yaml`). TC-002's results above are historical.

**TC-003 removed 10/11/2026.** The standalone profile exemption-status flow
(`real-estate-tax-profile-exemption-status.yaml`) was deleted. Existing Profile exemption/certificate
coverage stays in E2E-001: it opens Profile → First Home VAT Exemption, requires `Certificate Issued
successfully`, captures the certificate number and later proves the service route shows the same
number. Now **manual QA scope**: `Status`, `Checked on` and its date format, the absence of the "not
applied" prompt and of `Check Eligibility`, the certificate explanation text, and the `Download` CTA
on the Profile page. TC-003's results above are historical.

**TC-006 removed 10/11/2026.** The standalone profile-prompt flow
(`real-estate-tax-profile-prompts-eligibility.yaml`) was deleted. Not-eligible blocking and the
`Check Eligibility` → Eligibility routing stay automated in TC-005
(`real-estate-tax-submit-request-with-not-eligible-user.yaml`), from the service-page entry. Now
**manual QA scope**: the Profile-page prompt for a user without Eligibility (`Exemption status`,
`You have not applied for an exemption`, `Complete your Eligibility form before requesting an
exemption`, no `Certificate Issued successfully` or `Certificate number`, and the Profile's
`Check Eligibility` presentation and routing). TC-006's results above are historical.

**Current automated scope: 3 flows.** E2E-001 `real-estate-tax-e2e.yaml` (positive
existing-certificate journey, both routes), TC-004 `real-estate-tax-duplicate-request-check.yaml`
(a repeated request returns the same certificate, no new request) and TC-005
`real-estate-tax-submit-request-with-not-eligible-user.yaml` (not-eligible user blocked and routed
to Eligibility; `writes-data`, `needs-ineligible-account`).

## Layout

```
.maestro/
  subflows/                           shared, reused unchanged
    clear-overlays.yaml                 first-run / promo / NPS surfaces
    dismiss-nps.yaml                    the one NPS implementation
    tap-until-destination.yaml          navigate, surviving an NPS sheet
    open-account-service.yaml           scroll + open a named Account service
    account-ready.yaml                  prove the Account tab is loaded
  services/real-estate-tax/
    subflows/
      open-vat-service.yaml             Services → Housing Support Products → Real estate tax
      open-ret-profile.yaml             Account → Real estate tax (the AC3 page)
      leave-ret-profile.yaml            exit the exemption page (its back arrow)
    <readable-name>.yaml                one flow per test case (Jira ID in its header)
    real-estate-tax-e2e.yaml            full journey → issued certificate, both routes
```

No shared helper was modified for this ticket, and no helper was duplicated.

## Prerequisites

1. An Android emulator or device visible to `adb devices`.
2. Sakani `fi.iwa.sakani` installed.
3. **An authenticated session already on the device** — the suite does not sign in. If one is
   needed:

```bash
maestro test .maestro/subflows/services-session.yaml          # the suite account, 1000011487
maestro test -e NATIONAL_ID=<test-id> .maestro/subflows/services-session.yaml   # another account
```

4. **Account state matters for this ticket.** E2E-001 and TC-004 require a beneficiary who
   **has** completed Eligibility; TC-005 requires one who **has not** (see below).

## Running

One test:

```bash
maestro test .maestro/services/real-estate-tax/real-estate-tax-duplicate-request-check.yaml
```

The end-to-end journey — catalogue to issued certificate, proving both routes reach one record
(**Passed 08/10/2026, 2m 30s**):

```bash
maestro test .maestro/services/real-estate-tax --include-tags e2e
```

All SAKANI-23459 tests runnable with an eligibility-completed account:

```bash
maestro test .maestro/services/real-estate-tax --include-tags sakani-23459 --exclude-tags needs-ineligible-account
```

The full `Real-estate-tax` suite (same set; the suite is this ticket's coverage today):

```bash
maestro test .maestro/services/real-estate-tax --include-tags real-estate-tax --exclude-tags needs-ineligible-account
```

`--include-tags` is required: Maestro walks a directory recursively, so without it the run also
tries to execute `real-estate-tax/subflows/*.yaml` as standalone tests. Those are helpers and fail
on their own. Every test flow carries both `sakani-23459` and `real-estate-tax`; no helper carries
either.

The negative-path case (TC-005) needs an account that has NOT run Eligibility:

```bash
maestro test -e NATIONAL_ID=1012204739 .maestro/subflows/services-session.yaml
```

**TC-005 (`real-estate-tax-submit-request-with-not-eligible-user.yaml`) is tagged `writes-data`.** It taps
"Request a service" on an account without Eligibility; if AC1 is not implemented, that tap is the
SAKANI-7559 path and raises a real VAT request. The runner refuses it without
`--yes-i-understand-this-changes-business-data`. Do not run it by folder or tag with plain
`maestro test`. Run it only with explicit approval, against an account confirmed server-side to
hold no certificate and no pending request.

**Executed 07/10/2026 against `1012204739`** — an authorized project fixture whose Eligibility has
never been run (`services/core/account.yaml` documents this; the Account row shows
"Eligibility checker status" with no status value). Both cases **FAILED** on the exact strings
SAKANI-23459 requires: TC-006 found no "Exemption status" prompt, TC-005 no "Missing some
information" validation.

Both are classified:

> **`FAIL - ENVIRONMENT / TEST DATA ISSUE - PRODUCT DEFECT NOT CONFIRMED`**

The acceptance criteria are unambiguous and the tests executed correctly — there is no automation
issue and no requirement ambiguity. What blocks promoting these to confirmed product defects is the
staging data: that account's Real Estate Tax page shows a certificate number (redacted; 14 digits)
**identical to a different beneficiary's**. Two beneficiaries cannot share a certificate number, so
the staging VAT backend is returning shared or invalid certificate data. A beneficiary who appears
to already hold a certificate would suppress both AC1 and AC3 whether or not the precondition is
implemented correctly, so the observed failures cannot yet be attributed to the app.

To promote or clear them, re-run against staging VAT data that is genuinely per-beneficiary and
confirm `1012204739` holds no certificate server-side. The assertions need no change — they already
encode the ACs verbatim.

Switching accounts uses the project's own pattern (`launchApp: clearState: true` + `login.yaml`),
which clears the local session only and modifies no beneficiary data. **Restore the suite's own
account afterwards**, or E2E-001 and TC-004 will run against the wrong state:

```bash
maestro test -e NATIONAL_ID=<suite-account-id> .maestro/subflows/services-session.yaml
```

Syntax check (takes files, not directories):

```bash
maestro check-syntax .maestro/services/real-estate-tax/real-estate-tax-e2e.yaml
```

### Reporting

Maestro 2.9.0 supports `--format` and `--output` on `test`:

```bash
maestro test .maestro/services/real-estate-tax --include-tags real-estate-tax \
  --exclude-tags needs-ineligible-account \
  --format junit --output real-estate-tax-report.xml
```

Screenshots from `takeScreenshot` are written to
`~/.maestro/tests/<run-timestamp>/<flow name>/takeScreenshot/<name>.png`.

## Environment variables

| Variable | Default | Used by | Sensitive |
|---|---|---|---|
| `NATIONAL_ID` | `1000011487` (in `services-session.yaml`) | `../../subflows/services-session.yaml` - run by the runner before the first service flow, or by hand | **yes — never commit** |
| `ANCHOR` | none | `clear-overlays.yaml` | no |
| `TARGET`, `DESTINATION` | none | `tap-until-destination.yaml` | no |

The test flows themselves take no parameters: every assertion is on authored UI text from the
ticket's acceptance criteria, and the one piece of account data they touch — the certificate number
— is matched as a digit pattern rather than a literal, so no beneficiary record is committed.

## Selector notes

The one coordinate tap in this suite is in `leave-ret-profile.yaml`: the exemption page's back
arrow. That page has **no bottom tab bar** and **ignores the Android hardware back key** (verified
live — `- back` reported COMPLETED and the screen did not change), and the arrow is an unlabelled
`ImageView` with no text, name or id. The point `7%,9%` is read from the live hierarchy and is the
same coordinate the shared `clear-overlays.yaml` already uses for this identical control on another
screen. The helper asserts the page actually closed, so a miss fails loudly.

`open-vat-service.yaml` scrolls the "Real estate tax exemption" card into the centre before tapping
it: the card is last in the catalogue and its bounds overlap the bottom tab bar, so an uncentred tap
lands on the tab bar and silently does nothing.

## Jira acceptance-criteria coverage

SAKANI-23459 carries **three** acceptance criteria. Two are UI behaviours (automated except AC3's negative Profile prompt, manual since 10/11/2026); the
third is not observable from the mobile app at all.

| AC | Requirement | Covered by |
|---|---|---|
| **AC1** | VAT service page — "Request service" shows *Missing some information* / *Please check your Eligibility status first* / CTA *Check Eligibility* when Eligibility has not been run | E2E-001 (positive: service entry, Request a service, not blocked; TC-001 and TC-002 removed 10/11/2026), TC-005 (negative) |
| **AC2** | *"if the Family_size in the bene_app is nil, fix the value for the family_size = 1 to allow the user to submit the VAT service"* | **Not automatable from the UI — see below** |
| **AC3** | Mobile Profile / Real estate tax page shows *Exemption status* / *You have not applied for an exemption…* / CTA *Check Eligibility* | E2E-001 (positive: Profile route shows the issued certificate; TC-003 removed 10/11/2026). Negative Profile prompt: **manual** since TC-006 was removed 10/11/2026 |

**AC2 is a backend-only criterion.** `family_size` is never rendered, entered or echoed anywhere in
the mobile journey — it is a server-side defaulting rule applied while the VAT request is built.
From the app, a correctly-defaulted `family_size` and a wrongly-defaulted one produce an identical
screen, so no mobile assertion can distinguish them. It is recorded here rather than silently
omitted: closing it needs an API-level test against the create-VAT-certificate endpoint with a
beneficiary whose `family_size` is nil, which is outside this suite's scope.
