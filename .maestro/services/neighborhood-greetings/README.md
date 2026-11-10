# `Neighborhood Greetings` suite — SAKANI-38946 / SAKANI-29885

> Migrated on 11/10/2026 from the standalone services project into `Maestro-Mobile` (`.maestro/services/neighborhood-greetings/`).
> Shared helpers now resolve to the project-wide `.maestro/subflows/`. Execution results in this file are
> **historical** (PRE-4.7.6-1283, 06–08/10/2026), not a post-migration run — see the project
> [README](../../../README.md) for current validation and the consolidated runner commands.

Mobile automation for the Sakani **Neighborhood Greetings** service, which the app itself labels
**"Seventh Neighbor"**.

| | |
|---|---|
| **Jira** | [SAKANI-38946](https://jira.nhc.sa/browse/SAKANI-38946) (V3) · [SAKANI-29885](https://jira.nhc.sa/browse/SAKANI-29885) (V1.0) |
| **Suite** | `Neighborhood Greetings` → `.maestro/services/neighborhood-greetings/` |
| **App** | `fi.iwa.sakani` |
| **Build validated** | PRE-4.7.6-1283 (versionName 4.7.6) |
| **Device validated** | Pixel_8 emulator, Android 14 (API 34), 1080×2400 |
| **Maestro** | 2.9.0 |

> ## ⚠️ This service messages real people. Read this before running anything.
>
> Sending a greeting makes the backend **send SMS and push notifications to real residents** whose
> phone numbers come from the GIS `gis/GetNeighbors` API — people who never agreed to be part of a
> test. SAKANI-29885 also states that **"users can send greetings to each neighbor only once"**,
> undone only by an **Admin history reset**. A single stray tap is therefore irreversible *and*
> permanently consumes this beneficiary's one greeting to that neighbour.
>
> **Sending was authorised by the project owner for this pre-production environment on
> 08/10/2026.** `E2E-001` nevertheless **stops one tap short of it**: it composes the greeting,
> confirms the recipient and reaches the Review Greetings sheet, asserts **Send greeting card** is
> available, and does not tap it. The send could not be executed in the session that built this
> suite, so the success confirmation, the Shared-moments counter and the History entry have **never
> been observed** — and nothing is asserted about screens nobody has seen.
>
> Controls the flow never touches, and why:
>
> | Control | Why it is skipped |
> |---|---|
> | **Send greeting card** | Authorised, but unobserved — see above and the TODO at the end of the flow. |
> | **Start Connecting** | Publishes this beneficiary onto the neighbourhood map for other residents and stores their nickname against their national address. 29885: the chosen address *"should be saved in system and not be changed"*. Not on the critical path — the journey reaches the map and sends without it. |
> | **Add an optional surprise** (gift voucher) | Optional, outside the primary happy path, and the cards carry live stock states (*"Only few left"*). |
> | **Save as image** | Downloads the composed card to the device. |
>
> `E2E-001` as written is safe to run. Running it **modifies nothing**.

## This suite is new

There was no `Neighborhood Greetings` automation before 08/10/2026 — no functional cases, no
README, no traceability, no prior execution results. Everything here was built that day.

## Status — 13/10/2026, PRE-4.7.8-1308

Full run (`npm run test:service -- neighborhood-greetings`, account 1000011487): **12 PASS** - 3 in the
full run, 9 on the one approved rerun after the emulator display froze (Flutter raster SIGSEGV, all
screenshots black, launcher included; cold boot of the same AVD). Nothing was sent, created, saved or
connected.

Changed 13/10/2026 (automation only, business expectations kept):
- TC-004 now reads the generated message back: exact design control "Change", Change message yields a
  DIFFERENT text, and both texts are at most 150 characters (29885).
- TC-006 asserts the History tabs and (when Shared moments is 0/0) the empty state - D-5 no longer
  reproduces. The D-6 copy is deliberately not asserted.
- TC-007 no longer claims "defaults to enabled": the switch is visibly ON but reports
  checked="false" (D-10), so the default is screenshot evidence only.
- TC-009 opens the description editor outcome-driven (an early tap is ignored - seen 11/10 and again
  13/10, first pass WARNED, second opened it).
- Optional loop taps (Continue / Tag 1) with arrival proven afterwards.

Still present: D-1 (Services catalogue "No services found"), D-3 ("Chose your prefered greeting"),
D-4 ("Seventh Neighbour Preferences"), D-6 ("Send you neighbors greeting..."), D-9 ("1 Neighbors"),
D-10 (preference switch state not exposed to accessibility). Not reproduced: D-5, D-7, D-8.

## Full-coverage completion — 13/10/2026 (afternoon), PRE-4.7.8-1308

User-approved controlled PRE data changes.
**Real greetings were sent** (1533687096 and 1012204739, one each, to the PRE fixture neighbour), and
1012204739 tapped Start Connecting. 1000011487 was not changed.

| Case | Flow | Tags | Result |
|---|---|---|---|
| TC-012 send a greeting | `neighborhood-greetings-send-greeting.yaml` | writes-data | Send executed twice and verified (counter 0→1, History record, success sheet, dashboard redirect); final Home-anchor fix syntax-validated only |
| TC-013 one greeting per neighbour | `neighborhood-greetings-second-greeting-check.yaml` (renamed 10/11/2026 from `neighborhood-greetings-one-greeting-per-neighbour.yaml`) | writes-data | **PASS** - server refuses the duplicate, count unchanged |
| TC-014 populated History | `neighborhood-greetings-history-populated.yaml` | needs-greeting-history | **PASS** (1533687096) |

Run them only with an approved sender, never as 1000011487 (each flow refuses it):

```bash
node report-dashboard/run-and-report.js --service neighborhood-greetings --flows neighborhood-greetings-history-populated --env NATIONAL_ID=<id>
npm run test:service -- neighborhood-greetings --flows neighborhood-greetings-send-greeting --env NATIONAL_ID=<id> --yes-i-understand-this-changes-business-data
```

PRE fixture: every account resolves to building 3702 with ONE neighbour, "building 3716" - so
reception, multiple recipients and gender filtering are **BLOCKED - TEST DATA**. Event creation is
**BLOCKED - PRODUCT (build)**: the APK pairs arcgis_maps 200.7.0.4560 (Dart) with arcgis_maps_core
200.8.0.4672 (native, arm64 and x86_64), so the Esri map engine fails at start-up and no map renders;
the location picker cannot produce a point and Send stays disabled (the link to Send is the most
likely cause, not proven). Arabic was checked by exploratory runs, not by an automated flow.

New potential defects: sent-greeting tracker says "Message received - From: <neighbour>"; tracker time
is 3 h behind local (seen on both sends); greeted neighbour still offered pre-selected (refused only at
Send); event end time before start time accepted silently; event preview shows the event name as the
host; Events-tab empty state uses the greetings copy; Arabic "1 جيران", "&" in the summary, "PM" not
localized in the tracker.

## Coverage and results (live, 08/10/2026, PRE-4.7.6-1283 — historical)

| Case | Scenario | Ticket | Status |
|---|---|---|---|
| **E2E-001** | Full journey → review sheet, Send asserted available | both | **BLOCKED AT FINAL ACTION** |
| **TC-001** | Service opens from Quick Access; main screen renders | 29885 entry / 38946 summary | ✅ Passed |
| **TC-002** | Create chooser offers greetings **and** events | 38946 | ✅ Passed |
| **TC-003** | Occasion catalogue renders CMS tags; a tag opens its card | 29885 | ✅ Passed |
| **TC-004** | Card renders with message, design and regenerate controls | 29885 | ✅ Passed |
| **TC-005** | Map resolves the national address; neighbours selectable, list ↔ map | 29885 | ✅ Passed |
| **TC-006** | History opens without crashing — guards SAKANI-41692 | 38946 | ✅ Passed |
| **TC-007** | Notification preferences open, default enabled | 38946 | ✅ Passed |
| **TC-008** | Create-event form marks mandatory fields; Send inert while empty | 38946 | ✅ Passed |
| **TC-009** | Event description editor caps its stored text | 38946 | ✅ Passed |
| **TC-010** | Quick Access opens the service; Services catalogue omits it — guards D-1 | 29885 | ✅ Passed |
| **TC-011** | Multi-address chooser lists all addresses, pre-selecting the one in use | 29885 | ✅ Passed |

**Total 12 · Passed 11 · Failed 0 · Blocked 1 · Not Executed 0**

`E2E-001` is **not** a failure: it executes cleanly to the Review Greetings sheet and asserts
`Send greeting card` is available. Sending is authorised for this environment but has never been
executed, so the success confirmation, the Shared-moments increment and the History entry remain
unobserved and unasserted.

**TC-002 removed 10/11/2026.** The standalone create-chooser flow
(`neighborhood-greetings-create-chooser.yaml`) duplicated E2E-001, which opens the create chooser,
asserts `Create Greetings` and `Create Event`, then continues the journey. TC-002's results above
and in the dated status sections are historical; its coverage now lives only in E2E-001.

**TC-004 removed 10/11/2026.** The standalone greeting-card flow
(`neighborhood-greetings-greeting-card.yaml`) was deleted. E2E-001 still composes a greeting card,
asserts `Change message` and `Save as image`, taps `Continue` and goes on to neighbour selection and
Review Greetings. TC-004's extra checks — generated text non-empty and at most 150 characters,
`Change message` producing a different text, and the regeneration loop — are now **manual QA
scope**. TC-004's results above and in the dated status sections are historical.

**TC-005 removed 10/11/2026.** The standalone neighbour-map flow
(`neighborhood-greetings-neighbour-map.yaml`) was deleted. E2E-001 still covers the map and
neighbour selection: it reaches `Seventh Neighbor Map`, asserts Building number and Zip code, opens
`List view`, asserts the neighbour count, the building entry and `Unselect all` (neighbours arrive
selected), taps `Confirm neighbor` and reaches Review Greetings. TC-005's extra `List view → Map view`
return check is now **manual QA scope**. TC-005's result above is historical.

**TC-003 removed 10/11/2026.** The standalone greeting-catalogue flow
(`neighborhood-greetings-greeting-catalogue.yaml`) was deleted. Catalogue → Tag → Greeting Card is
now covered by E2E-001: it taps `Create Greetings`, waits for the tag catalogue (`test tag 1`
visible), selects a live tag by position, then asserts `Continue`, `Change message` and
`Save as image` and continues the journey. One difference: E2E-001 never taps `test tag 1` itself,
so the proof that this placeholder tag opens a card (the basis for withdrawing D-2) is no longer
automated. TC-003's result above is historical.

**TC-001 and TC-010 removed 10/11/2026.** The standalone Quick Access flows
(`neighborhood-greetings-opens-from-quick-access.yaml`, `neighborhood-greetings-quick-access-only.yaml`)
were deleted. Quick Access opening is now covered by E2E-001: Home → Quick Access
(`subflows/open-seventh-neighbor.yaml`) → main screen with `Shared moments` and the
greetings/events summary → the full greeting journey. Now **manual QA scope**: the empty-inbox text
`Your Inbox is Quiet` (TC-001), and the Services-catalogue search for "neighb" returning
`No services found` (TC-010, the D-1 guard). D-1 is tracked as a defect, no longer by automation.
Their results above and in the dated status sections are historical.

**TC-011 removed 10/11/2026.** The address-chooser flow (`neighborhood-greetings-address-chooser.yaml`)
was deleted because it did not prove its title: it opened the National Address chooser, saw at least
one building/zip and a Save button, and closed without saving. It never proved several addresses
exist, that every address is listed, that the current one is pre-selected, or that choosing and
saving another address works. Those checks are now **manual QA scope**. E2E-001 still reaches
`Seventh Neighbor Map` and asserts the Building number and Zip code. TC-011's result above is
historical.

**TC-006 removed, TC-014 relaxed 10/11/2026.** The standalone History crash guard
(`neighborhood-greetings-history.yaml`, SAKANI-41692) was deleted. TC-014 now covers History opening
and staying usable: it opens History, uses the All / Greetings / Events tabs, opens a real greeting
record and its Track message sheet. The **empty-History state** (`Empty … Greet your neighbors`,
shown at 0 greetings & 0 events) is now **manual QA scope**. TC-014 needs an account with **at least
one sent greeting**. It no longer requires exactly `1 greeting & 0 events`, and it no longer expects
the Events tab to be empty: it only checks that the tab opens (selected). An account with no sent
greeting in History is reported as `BLOCKED - TEST DATA`. TC-006's results above are historical;
SAKANI-41692 stays as defect history.

## Defects

| ID | Finding | Severity |
|---|---|---|
| **D-1** | Service missing from the Services catalogue — 29885 lists it as an access point; only Quick Access exists, and a catalogue search for "neighb" returns *No services found*. **Needs confirmation.** Manual / defect-tracking only since 10/11/2026 (its automated guard, TC-010, was removed). | Medium |
| **D-3** | *About service* copy: "Chose your prefered greeting" → "Choose your preferred greeting". | Low |
| **D-4** | Service name spelled inconsistently: the preferences screen says **"Seventh Neighbour Preferences"** (British), every other screen says **"Seventh Neighbor"** (American). | Low |
| **D-5** | **History screen body is not exposed to the accessibility tree.** The filters, the "Empty" state and the CTA all render correctly but none resolves; only the title does. Unreadable by TalkBack and unautomatable. **Needs TalkBack confirmation.** | Medium |
| **D-6** | History empty-state copy: "Send you neighbors greeting so they can send you back" → "Send your neighbors a greeting…". | Low |
| **D-7** | The **Events** occasion screen shows the **greetings** coach-mark: *"Select what is your greeting about"*. Wrong journey's copy. | Low |
| **D-8** | Create-event coach-mark reads *"Set events name, date and time"* → *"event's name"*. | Low |
| **D-9** | Neighbour list count reads **"1 Neighbors"** (13/10/2026) → "1 Neighbor". | Low |
| **D-10** | **Notification preference switch state is not exposed to accessibility**: visibly ON, the row reports `checked="false"` (13/10/2026). TalkBack would announce the wrong state. **Needs TalkBack confirmation.** | Medium |
| ~~D-2~~ | ~~`test tag 1` is a dead control~~ — **WITHDRAWN.** It works; the exploratory tap that suggested otherwise had been swallowed by the catalogue's one-time coach-mark. TC-003 asserted the correct behaviour until it was removed on 10/11/2026; no current flow taps `test tag 1`. | — |

## Outstanding questions

| | |
|---|---|
| **Q1** | 29885 requires the service on the **Services page**; only Quick Access exists (D-1). Descoped, or a gap? |
| **Q2** | The app's CTA reads **"Start now"** where 29885 specifies *"Start service"*. |
| **Q3** | 29885 requires a **deep link URL**; no ticket read states it, so it cannot be tested. |
| **Q4** | The **event description silently caps at 100 characters** (162 typed, 100 kept, no counter or error). No ticket read states a limit for this field. Is 100 intended? *29885's 150-character rule governs CMS-authored greeting texts, not this field.* |
| **Q5** | 29885 says the chosen national address **"cannot be changed in the future"**, yet the chooser still opens and still offers **Save** after one has been chosen. Whether the server would reject a change cannot be established without making one. |

## Layout

```
.maestro/
  subflows/                           shared, reused unchanged
    clear-overlays.yaml                 first-run / promo / NPS surfaces
    dismiss-nps.yaml                    the one NPS implementation
  services/neighborhood-greetings/
    subflows/
      open-seventh-neighbor.yaml        Home → Quick Access → About service → main screen
      open-create-chooser.yaml          main screen → expanded create chooser
      compose-greeting.yaml             chooser → occasion → composed card
      open-create-event-form.yaml       chooser → event occasion "Tag 1" → create-event form
    neighborhood-greetings-e2e.yaml     the journey, ending on the review sheet
    <readable-name>.yaml                one flow per functional case (Jira ID in its header)
```

No shared helper was modified, and no helper was duplicated.

## Prerequisites

1. An Android emulator or device visible to `adb devices`.
2. Sakani `fi.iwa.sakani` installed.
3. **An authenticated session already on the device** — the suite does not sign in. Defect
   SAKANI-41754 (*"The user can access the Seventh Neighbor service if the client is not logged
   in"*, SOLVED) made login a hard gate on this service:

```bash
maestro test .maestro/subflows/services-session.yaml          # the suite account, 1000011487
maestro test -e NATIONAL_ID=<test-id> .maestro/subflows/services-session.yaml   # another account
```

4. **A beneficiary with at least one national address.** The service resolves it through
   `gis/GetHousesById`; without one the journey cannot reach the map.
5. **At least one CMS greeting tag published, including the `test tag 1` placeholder.** The tag
   catalogue is admin-managed (29885: *"Sakani CMS admin can add new tags"*). `test tag 1` is this
   environment's placeholder and is what `E2E-001` uses to prove the catalogue rendered. It renders
   grey (no cover image) but WORKS - TC-003 proved its card opens (D-2 withdrawn); TC-003 was
   removed on 10/11/2026 and E2E-001 opens a different, live tag.

## Running

```bash
maestro test .maestro/services/neighborhood-greetings --include-tags neighborhood-greetings
```

`--include-tags` is required: Maestro walks a directory recursively, so without it the run also
tries to execute `neighborhood-greetings/subflows/*.yaml` as a standalone test. The test flow
carries `sakani-38946`, `sakani-29885`, `neighborhood-greetings` and `e2e`; the helper carries none.

Syntax check (takes files, not directories):

```bash
maestro check-syntax .maestro/services/neighborhood-greetings/neighborhood-greetings-e2e.yaml
```

## The service is full of one-time surfaces — this is the main automation hazard

Four separate first-run-only screens sit in this journey, and each one broke a run before it was
guarded. **None of them can be used as an arrival contract.**

| Surface | Behaviour |
|---|---|
| **About service** page + `Start now` | Shown on the **first entry only**. Every later entry goes straight to the main screen. |
| **Connect with your community** sheet | Shown until the beneficiary connects. Closed by its X at `10%,35%`. |
| Coach-mark *"Start by creating new greeting or event"* | One-time; **swallows the first tap** on the floating button beneath it. |
| Coach-mark *"Select what is your greeting about"* | One-time, full-viewport (`[0,0]-[1080,2337]`). It is a **tip, not the screen's title**. |
| Coach-mark *"Generate different message easily"* | One-time; swallows the first `Continue`. |

The flow therefore guards every one-time screen with `runFlow: when:` and drives both tap-eating
coach-marks with **outcome-driven loops** (repeat until the destination is actually reached), so it
behaves identically on a fresh account and on one that has seen the tour.

## Selector notes

- **The screen title `Seventh Neighbor` is not a usable selector.** It is painted continuously but
  reaches Maestro's hierarchy only intermittently — the same header-node instability this project
  documents on the Financial advisory form. Arrival is proven by `Shared moments` instead.
- **Three coordinate taps**, all from the live 1080×2400 hierarchy/screenshots, all with an
  assertion behind them so a miss fails loudly:
  | Point | Control |
  |---|---|
  | `10%,35%` | X on the connect sheet — centre `(104,848)` |
  | `89%,93%` | the create floating button — centre `(958,2227)` |
  | `82%,21%` | the third CMS tag card — bounds `[734,311]-[1038,716]` |
- **The live tags carry Arabic labels**, so the tag is taken by position rather than by name: the
  catalogue is CMS-driven and the occasions get reordered and renamed.
- **The map's address card is one aggregated node** holding the building number and the zip code
  together, and it paints *after* the Esri map. It needs a `.*`-tolerant regex (Maestro text
  selectors are full-match) **and** an `extendedWaitUntil`, not a bare `assertVisible`.
- **No personal data is committed.** The building number and zip code are a real beneficiary's home
  address and are asserted as digit patterns only; no national ID, address, nickname or message
  text appears in any file in this suite.

## Coverage gaps

`E2E-001` is one journey, not functional coverage. Everything below is untested:

- **The send itself and everything after it** — tapping `Send greeting card`, the success
  confirmation (29885: *"Show a success message upon confirmation"*, then *"Redirect users to the
  dashboard"*), the Shared-moments counter incrementing from 0, and the History entry. Recipient
  selection and the review sheet **are** covered as of 08/10/2026.
- **Multi-recipient selection** — this environment's GIS API returns a single neighbour, so
  "select multiple" and "select all" (and 29885's stacked same-building rule) cannot be exercised.
- **The Events journey beyond the form** (SAKANI-38946) — TC-008 (mandatory fields, Send inert while
  empty) and TC-009 (description cap) cover the form; date, location, guest list, sending,
  invitation responses and Track Invitation are untested.
- **Receiving** — notification centre, mail box, "Open Gift", "Thank your neighbor" via WhatsApp.
  Needs a second account and a delivered greeting.
- **29885's validation rules** — NIN-not-found error, the never-changeable address choice (Q5; the
  multi-address chooser is manual-only since TC-011 was removed on 10/11/2026), the "no neighbours" error, the 5-texts-per-tag limit, and the
  one-greeting-per-neighbour restriction (neighbours already greeted must render disabled). The
  150-character rule on generated texts and `Change message` regeneration are manual-only since
  10/11/2026 (TC-004, which automated them from 13/10/2026, was removed).
- **Default notification preference** — visibly ON, but not machine-assertable (D-10).
- **Gender segregation** — 29885 requires the API to return only same-gender neighbours. The suite
  account is female; nothing asserts the rule, and it cannot be checked from one account.
- **Access points other than Quick Access** — banners, the Services page and the deep link.
- **History** — TC-014 covers the screen, tabs and a sent greeting's tracker (needs an account with
  at least one sent greeting); the empty state is manual-only since TC-006 was removed (10/11/2026).
  Received greetings in History are untested.
