# `Sakani Offers` suite — SAKANI-31966

> Migrated on 11/10/2026 from the standalone services project into `Maestro-Mobile` (`.maestro/services/sakani-offers/`).
> Shared helpers now resolve to the project-wide `.maestro/subflows/`. Execution results in this file are
> **historical** (PRE-4.7.6-1283, 06–08/10/2026), not a post-migration run — see the project
> [README](../../../README.md) for current validation and the consolidated runner commands.

Mobile automation for **[SAKANI-31966 — Enhance Sakani Offers (Vouchers) Mobile](https://jira.nhc.sa/browse/SAKANI-31966)**,
built inside the existing Sakani Maestro project.

| | |
|---|---|
| **Jira** | SAKANI-31966 (Epic, Done) |
| **Suite** | `Sakani Offers` → `.maestro/services/sakani-offers/` |
| **App** | `fi.iwa.sakani` |
| **Build validated** | PRE-4.7.6-1283 (versionName 4.7.6) |
| **Device validated** | Pixel_8 emulator, Android 14 (API 34), 1080×2400 |
| **Maestro** | 2.9.0 |

> **These flows commit nothing.** Nothing here submits a Join Us request, a Contact Us message,
> shares anything from the device, or redeems a voucher. TC-004 fills the Join Us form to prove its
> validation contract and then **cancels** — it never submits, because AC4 stores those requests for
> staff review in the admin portal. E2E-001 copies a voucher code to the device clipboard (local and
> reversible) and *opens* the share sheet to prove AC1's sharing option exists, but **never selects a
> share target** and **never taps "Go to website"**, which hands off to the partner's external site.
> No approval is needed to run this suite.

## Status — 13/10/2026, PRE-4.7.8-1308

Full run (`npm run test:service -- sakani-offers`, account 1000011487): **6 PASS, 1 FAIL - PRODUCT DEFECT**
(TC-006, creation date missing).
The header table above and the historical notes below describe PRE-4.7.6-1283.

- The voucher-list support icon is rendered again (absent 11/10/2026); TC-003 and TC-004 pass.
- TC-005 now scopes options below the sheet's Scrim and proves two applied filters.
- A tap sent while the list is still settling is silently ignored; chips and cards are opened
  through outcome-driven helpers (`open-filter-sheet`, `open-voucher-details`).
- Still present: creation date missing (D-1), "Home Service" vs "Home Services" (D-3), no Join Us
  validation text (D-4), placeholder typo "e.g. E-commerece".

**TC-001 removed 10/11/2026.** The standalone voucher-list flow (`sakani-offers-voucher-list.yaml`)
was deleted. Catalogue loading is covered by E2E-001 (`Sakani Voucher`, `Coupon Category`, a real
`% off` card). The filter controls and actual filtering (Sort by, Coupon Category, Coupon Type, their
options, Home Service and Store narrowing the list) are covered by TC-005 `sakani-offers-filters.yaml`.
The static checks are now **manual QA scope**: segmentation labels (`All`, `Non-beneficiary only`),
`Exclusive`, the `Online` / `In store` card presentation, and standalone `Home Services` catalogue
content. TC-001's result in the 13/10 run above is historical.

**TC-003 removed 10/11/2026.** The standalone support-sheet flow (`sakani-offers-support-sheet.yaml`)
was deleted. Support-sheet entry and `Join as vendor` navigation are covered by TC-004
`sakani-offers-join-us-validation.yaml` (Support sheet → Join as vendor → Join as a Vendor form →
validation → Cancel, never submitted). The static content is now **manual QA scope**: `Contact Us`
and its description, the `Join as vendor` description, and the rest of the Support sheet's text.
TC-003's results above are historical.

**TC-002 and TC-006 removed 10/11/2026.** The details-page flow (`sakani-offers-details-page.yaml`)
and the creation-date guard (`sakani-offers-creation-date.yaml`, the suite's only `known-defect` flow)
were deleted. Voucher-details functional coverage stays in E2E-001: it opens the voucher and checks
`% off`, `Expiry date`, the customers-viewed count and `How to get this offer`, then copies the
voucher code, opens the share sheet and checks the voucher deep link. Now **manual QA scope**:
`About the partner`, `Terms and Conditions` and `You may also like`. The missing creation date (D-1)
is tracked manually / in Jira, not by an always-failing flow. The 13/10 "1 FAIL - PRODUCT DEFECT
(TC-006)" result and the D-1 history above are kept as historical.

**Current automated scope: 3 flows.** E2E-001 `sakani-offers-e2e.yaml`, TC-004
`sakani-offers-join-us-validation.yaml` and TC-005 `sakani-offers-filters.yaml`.

## Layout

```
.maestro/
  subflows/                           shared, reused unchanged
    clear-overlays.yaml                 first-run / promo / NPS surfaces
    dismiss-nps.yaml                    the one NPS implementation
    dismiss-keypad.yaml                 guarded keyboard dismissal
  services/sakani-offers/
    subflows/
      open-voucher-list.yaml            Home → Vouchers → "Sakani Voucher" list
      open-support-sheet.yaml           list header icon → Support bottom sheet
      open-filter-sheet.yaml            chip → its filter sheet, outcome-driven (added 13/10/2026)
      open-voucher-details.yaml         card → details page, outcome-driven (added 13/10/2026)
    <readable-name>.yaml                one flow per test case (Jira ID in its header)
    sakani-offers-e2e.yaml              the full journey, launch → code copied → shared
```

No shared helper was modified for this ticket, and no helper was duplicated.

## Prerequisites

1. An Android emulator or device visible to `adb devices`.
2. Sakani `fi.iwa.sakani` installed.
3. **An authenticated session already on the device** — the suite does not sign in:

```bash
maestro test .maestro/subflows/services-session.yaml          # the suite account, 1000011487
maestro test -e NATIONAL_ID=<test-id> .maestro/subflows/services-session.yaml   # another account
```

4. A **full (non-basic) account.** Defect SAKANI-36124 ("Basic account can navigate to join us
   form", Major, SOLVED) means Join Us access is account-type dependent; TC-004 asserts the
   full-account path.
5. A populated staging voucher catalogue containing at least one voucher in the **Home Services**
   category and at least one **Non-beneficiary only** voucher.

## Running

One test:

```bash
maestro test .maestro/services/sakani-offers/sakani-offers-filters.yaml
```

The end-to-end journey on its own:

```bash
maestro test .maestro/services/sakani-offers --include-tags e2e
```

All SAKANI-31966 tests:

```bash
maestro test .maestro/services/sakani-offers --include-tags sakani-31966
```

The full `Sakani Offers` suite:

```bash
maestro test .maestro/services/sakani-offers --include-tags sakani-offers
```

`--include-tags` is required: Maestro walks a directory recursively, so without it the run also
tries to execute `sakani-offers/subflows/*.yaml` as standalone tests. Those are helpers and fail on
their own. Every test flow carries both `sakani-31966` and `sakani-offers`; no helper carries
either.

Syntax check (takes files, not directories):

```bash
maestro check-syntax .maestro/services/sakani-offers/sakani-offers-filters.yaml
```

### Reporting

Maestro 2.9.0 supports `--format` and `--output` on `test`:

```bash
maestro test .maestro/services/sakani-offers --include-tags sakani-offers \
  --format junit --output sakani-offers-report.xml
```

Screenshots land in `~/.maestro/tests/<run-timestamp>/<flow name>/takeScreenshot/<name>.png`.

## Environment variables

| Variable | Default | Used by | Sensitive |
|---|---|---|---|
| `OFFER_NAME` | `Test Company name EN` | E2E-001 — which voucher to open | no |
| `COMPANY_NAME` | `Maestro QA Vendor` | TC-004 Join Us form | no |
| `BUSINESS_ACTIVITY` | `Home Services` | TC-004 | no |
| `CONTACT_MOBILE` | `0555555555` | TC-004 | no |
| `NATIONAL_ID` | `1000011487` (in `services-session.yaml`) | `../../subflows/services-session.yaml` - run by the runner before the first service flow, or by hand | **yes — never commit** |

All defaults are non-sensitive placeholders. No credentials, national IDs, OTPs or tokens appear in
this suite, and no real company or personal data is used in the Join Us form.

```bash
maestro test .maestro/services/sakani-offers/sakani-offers-e2e.yaml -e OFFER_NAME="Huy QR Code"
```

## Selector notes

The one coordinate tap is in `open-support-sheet.yaml`: the voucher list's support icon, an
unlabelled header `ImageView` with no text, name or id, read from the live hierarchy at
`[975,174]-[1038,237]` → `93%,9%`. It is **not** the on-screen tooltip ("For assistance or to join
as a partner … click here") — that auto-dismisses and cannot be used as a handle. The helper
asserts the sheet actually opened, so a miss fails loudly.

Two further behaviours these flows rely on:

- **Filter sheets are closed by their own `Scrim`, never by the back key.** `- back` pops the whole
  screen, landing the run on Home two levels away.
- **Home has two identical "See all" links** (Products and Vouchers). `rightOf: "Vouchers"`
  resolves to the *Products* one; the vouchers link is `index: 1`.
- **A disabled Submit cannot be asserted by selector** — it reports `enabled="true"` with
  full-screen bounds. TC-004 asserts the *outcome* of tapping it instead.

### The details page, as E2E-001 drives it

- **The voucher code is never hardcoded.** It is per-voucher staging data (`W3L-TV1` today), so
  E2E-001 addresses the code box by position — `below` the views-count chip, `above` "Go to
  website" — and proves the tap landed by waiting for the product's own `Copied` confirmation.
- **`Copied` is transient.** It reverts to showing the code after a few seconds, so it must be
  asserted immediately after the tap and never later in the flow.
- **The share control is a second unlabelled icon**, in the *details* header at `92%,8%` (glyph
  centre `(998,202)` on 1080×2400) — distinct from the *list* header's support icon at `93%,9%`.
  It is absent from the hierarchy entirely, so it cannot be asserted by text: E2E-001 taps it and
  asserts the system sheet that opens (`Sharing link` plus a `/app/promotion-vouchers/` deep link).
  An earlier text-based check for "Share" reported the feature missing; that was a bad assertion,
  not a defect.

## Known coverage gaps

| Area | Why not covered | What would close it |
|---|---|---|
| **AC1 — the non-logged-in view** | AC1 requires the details page to be *"accessible to all users (with limited info for non-logged-in users)"*. Every flow in this suite runs against an authenticated session, so the visitor variant — and which fields are withheld from it — is never exercised. Linked defect SAKANI-36129 (*"go to website appear for not logged in user"*, SOLVED) confirms the variant is real and has already regressed once. | A signed-out run of the voucher list and details page, asserting which AC1 fields are present and which are withheld. Needs a sign-out step, so it must not share a run with the authenticated cases. |
| **Basic-account restriction** | No basic (non-full) account available. Defects SAKANI-36124 (*Join Us reachable from a basic account*) and SAKANI-36125 (*code section shown to a basic account*), both SOLVED, are therefore unguarded. | A basic account, then negative cases asserting Join Us and the voucher code are unreachable. |
| **Sort order, end-date filter, Target Audience** | Since 13/10/2026 TC-005 proves the Home Service category and Store type filters narrow the list (preconditions asserted first). Not proven: the sort ORDER (cards carry no date), AC2's end-date filter (no such control in this build), and the "Target Audience" chip that appears after a type is applied. | Cards or details exposing a date to compare; an end-date control. |
| **Join Us / Contact Us submission** | Deliberately never submitted — AC4 stores requests for staff review in the admin portal. | Explicit approval plus a disposable vendor identity and a way to purge the request. |
| **Three DEFERRED crash defects** | SAKANI-36042 / 36047 / 36051 remain open upstream and did not reproduce in any run. Not reproducing a deferred crash is an absence of evidence, not evidence of a fix. | Nothing in this suite — status stays with the owning tickets. |
