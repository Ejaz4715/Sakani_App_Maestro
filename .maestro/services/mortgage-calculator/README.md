# `Mortgage Calculator` suite — SAKANI-32007

Mobile test automation for the Sakani **Mortgage Calculator**, derived from
[SAKANI-32007](https://jira.nhc.sa/browse/SAKANI-32007) and validated against the live app.

| | |
|---|---|
| **Jira** | SAKANI-32007 |
| **Suite** | `Mortgage Calculator` → `.maestro/services/mortgage-calculator/` |
| **App** | `fi.iwa.sakani` |
| **Build validated** | PRE-4.7.6-1283 (versionName 4.7.6) |
| **Device validated** | Pixel_8 emulator, Android 14 (API 34), **1080×2400** |
| **Maestro** | 2.9.0 |

> Migrated on 11/10/2026 from the standalone services project into `Maestro-Mobile`. Execution
> results in this file are **historical** unless stated otherwise — see the project
> [README](../../../README.md) for current validation.

## Automated scope (reduced 10/11/2026)

The suite intentionally automates **two journeys only**. Both fill the form with the same valid
data (1,000,000 / 20,000 / 2,000 / 20 years / 5 % / 10 %, beneficiary and first home = Yes), tap
`Calculate Your Mortgage` and stop once the result screen shows `Monthly payment`:

| Flow | Journey | Result proof |
|---|---|---|
| `mortgage-calculator-e2e.yaml` (E2E-001) | Home → Explore → marketplace unit → Unit Details → Mortgage Calculator → fill → Calculate → result | `Mortgage Calculator Result`, `Monthly payment`, `/Month` |
| `mortgage-calculator-happy-path.yaml` (TC-001) | Home → Services → Professional Services → Mortgage Calculator → Calculate Your Mortgage → fill → Calculate → result | `Mortgage Calculator Result`, `Monthly payment` |

**Out of automation scope, covered manually by the QA team:** the BRD funding model and the
calculated amounts, subsidy / VAT / salary-cap decisions, MSG01–MSG04 content, input bounds,
required fields and radios, Clear/reset, retained inputs, relaunch behaviour, result consistency,
result navigation, low-funding hints and obligation / allowance edge cases. The 15 flows that
automated these (TC-002…TC-012B, TC-016) were deleted on 10/11/2026. They included the suite's two
`known-defect` guards (TC-005B for D-2, TC-012B for D-14), so no Mortgage flow carries that tag now.

Neither reduced flow has been live-run yet. The Services route was proven live up to
"Financial information" on 09/11/2026; the unit route last passed on PRE-4.7.8-1308 (12/10/2026)
as part of the former, longer E2E-001.

## Layout

```
.maestro/
  subflows/                           global shared helpers (Maestro-Mobile)
    clear-overlays.yaml                 first-run / promo / NPS surfaces
    dismiss-nps.yaml                    the one NPS implementation
    tap-until-destination.yaml          navigate, surviving an NPS interruption
    services-session.yaml               sign-in as the suite account (runner / hand run)
  services/mortgage-calculator/
    subflows/
      open-mortgage-calculator.yaml     Home → Explore → unit → calculator form (E2E-001)
      open-mortgage-calculator-from-services.yaml
                                        Home → Services → Professional Services → Mortgage Calculator
                                        → Calculate Your Mortgage → form (TC-001)
      fill-calculator-form.yaml         fill all 8 inputs from a clean state
    mortgage-calculator-e2e.yaml        unit journey (E2E-001)
    mortgage-calculator-happy-path.yaml Services journey (TC-001)
```

`clear-overlays.yaml`, `dismiss-nps.yaml` and `tap-until-destination.yaml` are reused unchanged
from the existing `Maestro-Mobile` suite.

## Prerequisites

1. An Android emulator or device running, visible to `adb devices`.
2. Sakani `fi.iwa.sakani` installed.
3. **An authenticated session as the suite account.** The flows themselves do not sign in. The
   runner signs in first with `subflows/services-session.yaml` (1000011487). A signed-out run
   fails inside the navigation helpers (it never passes silently). For a hand run:

```bash
maestro test .maestro/subflows/services-session.yaml          # the suite account, 1000011487
maestro test -e NATIONAL_ID=<test-id> .maestro/subflows/services-session.yaml   # another account
```

E2E-001 also needs a Ready Unit for sale in the marketplace. No password or secret is stored
anywhere in this repository.

## Running

Both journeys:

```bash
maestro test .maestro/services/mortgage-calculator --include-tags mortgage-calculator
```

`--include-tags` keeps Maestro from collecting `mortgage-calculator/subflows/*.yaml` as tests:
both flows carry `mortgage-calculator` and `sakani-32007`, and no helper carries either.

One journey:

```bash
maestro test .maestro/services/mortgage-calculator/mortgage-calculator-e2e.yaml
maestro test .maestro/services/mortgage-calculator/mortgage-calculator-happy-path.yaml
```

Override the form data at runtime (each flow declares defaults in `env:`):

```bash
maestro test .maestro/services/mortgage-calculator/mortgage-calculator-happy-path.yaml -e PRICE=1500000
```

Syntax-check (takes files, not directories):

```bash
maestro check-syntax .maestro/services/mortgage-calculator/mortgage-calculator-happy-path.yaml
```

## Runtime variables

| Variable | Used by | Default | Sensitive |
|---|---|---|---|
| `PRICE`, `INCOME`, `OBLIGATIONS`, `YEARS`, `RATE`, `DOWN_PAYMENT` | both flows | `1000000`, `20000`, `2000`, `20`, `5`, `10` | no |
| `BENEFICIARY`, `FIRST_HOME` | `fill-calculator-form.yaml` | `yes` (`skip` leaves the group unanswered) | no |
| `NATIONAL_ID` | `services-session.yaml` (runner, or by hand) | `1000011487` | yes — never commit |
| `ANCHOR` | `clear-overlays.yaml` | none | no |
| `TARGET`, `DESTINATION` | `tap-until-destination.yaml` | none | no |

## Historical results (former 17-flow suite)

Kept for the record only. These runs belong to the suite **before** the 10/11/2026 reduction;
most of the flows they name no longer exist.

* **PRE-4.7.8-1308 (12/10/2026):** 17 flows run sequentially; 15 functional flows plus E2E-001
  passed, TC-005B (D-2) and TC-012B (D-14) failed by design.
* **PRE-4.7.6-1283 (06–08/10/2026):** TC-001…TC-012, TC-002B and TC-016 passed; TC-005B and
  TC-012B failed by design; TC-013 (Arabic), TC-014 (D-12) and TC-015 (D-1) manual / blocked. The
  BRD funding model was confirmed then (instalment within 0.02 SAR).

## Device portability

`fill-calculator-form.yaml` contains the suite's **only** coordinate taps — the four radio
circles, which carry no text, id or accessibility name and so cannot be addressed by any
selector (difference **D-4**). They are expressed as percentages measured from the live
hierarchy on a 1080×2400 screen. They are safe on a different screen size only if the form still
clamps to the same bottom layout; re-measure with `maestro hierarchy` before trusting the suite
on a new form factor. Nothing else in the suite uses coordinates.

## Gotchas worth knowing before editing these flows

1. **`hideKeyboard` is not a no-op — it sends BACK.** Calling it when no keypad is open pops the
   screen while every step still reports `COMPLETED`. Keep exactly one per `inputText`.
2. **Nodes behind the keyboard still report visible**, so `notVisible:` cannot detect the IME and
   `scrollUntilVisible` can "succeed" against a hidden element. Detect the IME by its own
   resource-ids (`id: ".*inputmethod.*"`).
3. **`below: "<label>"` mis-resolves on the calculator form.** Address inputs by placeholder text
   plus `index`, filling strictly top-down.
4. **The disabled CTA is indistinguishable by selector** (`enabled=true`, full-screen bounds), so
   assert the *outcome* of tapping it, never its styling.
5. **`\d` in a double-quoted YAML scalar fails to parse** — use `[0-9]`.
