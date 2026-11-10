# `financial advisor` suite — SAKANI-23300

> Migrated on 11/10/2026 from the standalone services project into `Maestro-Mobile` (`.maestro/services/financial-advisor/`).
> Shared helpers now resolve to the project-wide `.maestro/subflows/`. Execution results in this file are
> **historical** (PRE-4.7.6-1283, 06–08/10/2026), not a post-migration run — see the project
> [README](../../../README.md) for current validation and the consolidated runner commands.

Mobile automation for **[SAKANI-23300 — Financial Advisory Enhancement](https://jira.nhc.sa/browse/SAKANI-23300)**,
built inside the existing Sakani Maestro project and validated against the live app.

| | |
|---|---|
| **App** | `fi.iwa.sakani` |
| **Build validated** | PRE-4.7.6-1283 (versionName 4.7.6) |
| **Device validated** | Pixel_8 emulator, Android 14 (API 34), 1080×2400 |
| **Maestro** | 2.9.0 |

> ## ⚠️ These flows write to a real beneficiary account
>
> **TC-001, TC-002 and TC-003 each perform a REAL Financial Advisory submission.** Submitting
> invokes GetRecommendation or GetCertification, **overwrites the signed-in beneficiary's stored
> advisory data** (purchasing power, `calculated_purchasing_power_at`, employment, income,
> commitments, product type) and fires a push notification to the account.
>
> **TC-003 submits TWICE by design** — it is the only way to demonstrate the ticket's "last call
> wins" rule.
>
> **Do not re-run these three scenarios without explicit approval.** They are not read-only, they
> are not idempotent in their side effects, and a re-run tells you nothing new unless the build
> changed.
>
> **E2E-001 (`writes-data`) submits once when the account has no advisory.** If `Purchasing power`
> is already shown it only verifies the existing advisory (numeric purchasing power) and changes
> nothing; otherwise it taps Get recommendation, fills the form, ticks certification, taps Submit
> exactly once (never retried), verifies the issued recommendation, taps Done, reopens Financial
> advisory and verifies Purchasing power. On an account without an advisory it creates a real one.
>
> **No flow in this suite is read-only:** TC-001..003 always submit; E2E-001 submits when the
> account has no advisory.
>
> Never point this suite at an account whose advisory data matters.

## Execution status (12/10/2026, PRE-4.7.8-1308, account 1000011487)

Full suite run once, sequentially, with user approval for the three `writes-data` cases.

| Flow | Result | Submissions |
|---|---|---|
| E2E-001 (`financial-advisor-e2e`, version executed before the stored-input proof was added) | **FAIL - PRODUCT DEFECT**: Cancel persisted "Other allowances" 1,000 -> 500 without Submit | 0 |
| TC-001 market-ready-recommendation | PASS - recommendation wording, all 7 amounts read back in their own rows | 1 |
| TC-003 last-call-wins | PASS - Market Ready Unit, then Offplan reflected | 2 |
| TC-002 offplan-certification | PASS - certificate wording, recommendation wording absent, Offplan reflected | 1 |
| TC-004 timestamp-zero-padded | PASS - but the stored minute was 43, so the padding defect was NOT exercised | 0 |

**Found on PRE-4.7.8-1308:**
* **Cancel persists edits without Submit (PRODUCT DEFECT, reproduced twice).** Editing the form and
  leaving with Cancel stores the edited inputs server-side; the timestamp stays the same. Found by the
  former submit-free E2E-001; the current E2E-001 no longer uses Cancel, so it does not cover this.
* **Offplan (certification) submissions do not update the timestamp or the purchasing power
  (POTENTIAL PRODUCT DEFECT).** The profile then shows Offplan next to figures from the previous
  recommendation call, which conflicts with the ticket's "last call" rule.

## Execution status (live, 07/10/2026, PRE-4.7.6-1283)

| Category | Flows |
|---|---|
| **Passed** | TC-001, TC-002, TC-003 — `3/3 Flows Passed in 12m 19s` |
| **Pass to safe end point** | **E2E-001** — 08/10/2026, 3m 16s, exit 0. Full journey; stops before the committing Submit |
| **Known Product Defects / Conditional Failure** | **TC-004** — see below |
| **Failed Automation** | none |
| **Blocked** | none |
| **Not Executed** | none |

**TC-004 (historical; flow removed 08/11/2026).** It guarded a product defect: the advisory
timestamp's minute is not zero-padded, captured live as `07/10/2026 at 12:0`, reproducing only when
the account's last submission was made between HH:00 and HH:09. The flow was removed as a
time-dependent formatting check; the defect was never shown fixed and is no longer automated.

## Layout

```
.maestro/
  subflows/                           shared, reused across suites
    clear-overlays.yaml                 first-run / promo / NPS surfaces      (reused as-is)
    dismiss-nps.yaml                    the one NPS implementation            (reused as-is)
    tap-until-destination.yaml          navigate, surviving an NPS sheet      (reused as-is)
    account-ready.yaml                  prove the Account tab is loaded       (reused as-is)
    open-account-service.yaml           scroll + open a named Account service (reused as-is)
    dismiss-keypad.yaml                 NEW - guarded keyboard dismissal
  services/financial-advisor/
    subflows/
      open-financial-advisory.yaml      Home → Account → Financial advisory
      fill-fa-form.yaml                 fill all 10 inputs incl. product type
      set-amount-field.yaml             type one amount and verify it landed
      submit-fa.yaml                    legacy certify + submit helper; retained, not used by current TC-001/002/003/E2E-001
    <readable-name>.yaml                one flow per test case (Jira ID in its header)
    financial-advisor-e2e.yaml          existing advisory → verify only; none → fill, certify, submit once
```

## Running

One test:

```bash
maestro test .maestro/services/financial-advisor/financial-advisor-market-ready-recommendation.yaml
```

The end-to-end journey (`writes-data`: submits once when the account has no advisory, so excluded by
the `--exclude-tags ...,writes-data` commands below):

```bash
maestro test .maestro/services/financial-advisor --include-tags e2e
```

The whole `financial advisor` suite (every flow is `writes-data`; run only with approval):

```bash
maestro test .maestro/services/financial-advisor --include-tags financial-advisor
```

`--include-tags` is not padding: Maestro walks a directory recursively, so without it the run also
tries to execute `financial-advisor/subflows/*.yaml` as standalone tests. Those are helpers that
assume a screen is already open and fail on their own. Every test flow carries both the
`sakani-23300` and `financial-advisor` tags; no helper carries either.

Syntax check (takes files, not directories):

```bash
maestro check-syntax .maestro/services/financial-advisor/financial-advisor-market-ready-recommendation.yaml
```

## Runtime variables

Every value is overridable with `-e`. All defaults are non-sensitive financial figures; no
credentials, national IDs, OTPs or tokens appear anywhere in this suite.

| Variable | Default | Used by |
|---|---|---|
| `PRODUCT_TYPE` | `Market Ready Unit` | the field the ticket turns on — `Offplan` \| `Self Construction` \| `Market Ready Unit` |
| `EMPLOYMENT` | `Civil - Government Sector` | Type of Employment |
| `SALARY_BANK` | `Bank Albilad` | Salary bank |
| `INCOME`, `HOUSING_ALLOWANCE`, `OTHER_ALLOWANCES` | `20000`, `2000`, `500` | Income |
| `COMMITMENTS`, `COMMITMENT_MONTHS` | `1000`, `24` | Commitments |
| `DOWN_PAYMENT`, `SAVINGS` | `0`, `50000` | Down payment / Savings |
| `NATIONAL_ID` | `1000011487` (in `services-session.yaml`) | `../../subflows/services-session.yaml` - run by the runner before the first service flow, or by hand |

```bash
maestro test .maestro/services/financial-advisor/financial-advisor-market-ready-recommendation.yaml -e PRODUCT_TYPE="Self Construction"
```

The suite assumes an **already-authenticated session** on the device, matching the existing
project's model. To create one:

```bash
maestro test .maestro/subflows/services-session.yaml          # the suite account, 1000011487
maestro test -e NATIONAL_ID=<test-id> .maestro/subflows/services-session.yaml   # another account
```

## Maestro behaviours these flows work around

All six cost real debugging time on this form and are commented at the point of use:

1. **A subflow's `env:` default WINS over a caller's `runFlow` override** (2.9.0). A plain
   `PRODUCT_TYPE: "Market Ready Unit"` is not an overridable default — a case asking for Offplan
   silently submitted Market Ready Unit. Use the guarded idiom the suite already uses:
   `'${typeof X === "undefined" ? "default" : X}'`.
2. **`hideKeyboard` is not a no-op — it sends BACK.** Called with no keypad open it pops the
   screen while every step still reports COMPLETED. Use `subflows/dismiss-keypad.yaml`, which is
   guarded on the IME actually being present.
3. **Off-screen nodes still report visible.** `scrollUntilVisible` can "succeed" without
   scrolling, and a tap then lands on whatever occupies that position. Amounts were written into
   the wrong field this way. Centre the target (`centerElement: true`) before touching it.
4. **The amount inputs drop keystrokes while re-formatting.** `20000` became `SAR 2,000` with
   every step reporting COMPLETED. `set-amount-field.yaml` reads each value back and retypes.
5. **Option labels carry trailing spaces** and Maestro text selectors are full-match regexes, so
   `"Bank Albilad"` fails where `"Bank Albilad\s*"` matches.
6. **The form header's nodes are not stable in the accessibility tree** (HISTORICAL: no current flow
   leaves the form by Cancel; the former submit-free E2E-001 did). "Cancel" was on screen continuously
   but only intermittently in Maestro's hierarchy, so that E2E left the form by a `11%,8%` point tap
   in a loop driven by the destination. The current E2E-001 never uses Cancel or that point.

## Selector notes

The FA form exposes **no resource-ids, labels or accessibility names** on any input, dropdown or
checkbox. Inputs and dropdowns are therefore addressed by bracketing them between their own label
and the next heading, which works whether the field is empty or already holds a value — important,
because the form arrives pre-filled with the beneficiary's last submission.

The suite's only coordinate tap target is the certification checkbox. The proven point `7%,82%` is
used directly, exactly once per submission, in `financial-advisor-e2e.yaml`,
`financial-advisor-market-ready-recommendation.yaml`, `financial-advisor-offplan-certification.yaml`
and `financial-advisor-last-call-wins.yaml`. It has no text, no id, no accessibility name, and
`checked` stays false whether ticked or not, so no selector can address or verify it. It sits in a
**sticky footer**, so its position is fixed for the life of the screen rather than depending on
scroll. A miss cannot pass silently — an unticked box leaves Submit inert and the flow fails on its
outcome wait. Current flows never retry the certification tap or Submit.
