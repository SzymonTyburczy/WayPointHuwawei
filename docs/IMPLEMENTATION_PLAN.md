# Waypoint — implementation plan

Companion to [RFC-001](rfc/RFC-001-waypoint.md). The RFC says *what* and *why*; this
document says *how*, in which order, and how each piece is proven to work. Section
numbers in brackets (§n) point into the RFC.

## 0. Guiding decisions

| # | Decision | Reason |
| --- | --- | --- |
| D1 | The C++ core (`cpp/core`) has **zero third-party dependencies** and no React Native or HarmonyOS headers. It ships its own small JSON reader/writer. | It must compile unchanged for the host (tests, CI, eval), for `arm64-v8a`/`x86_64` OHOS, and later for OpenHarmony/Oniro. |
| D2 | The Tree Walker is a **template over an adapter** (`walker.hpp`). The host adapter walks a plain `RawNode` tree; the RNOH adapter (`harmony/…/ShadowTreeAdapter.h`) walks `facebook::react::ShadowNode`. | The traversal maths (§6: absolute frames, scroll offsets, clipping, cumulative opacity) is tested on the host; only the property extraction is platform code. |
| D3 | Derived fields (`name`, `actionable`, inherited `hidden`, modal occlusion, `rev`) are computed by one function, `finalize()`, over the flat array. | The shadow-tree walker and plan B (JS registry, §6) emit the same raw records and get identical semantics. |
| D4 | The guide loop is a **pure TypeScript state machine** (`GuideSession`) with injected `core`, `backend`, `snapshot` and `clock`. | The same code runs in the app, in Jest with fake backends, and in the host evaluation harness. No second implementation to drift. |
| D5 | The demo app is driven by a **declarative screen spec** (`examples/demo-app/src/app/spec.ts`) shared by the React Native renderer and the host **simulator** that produces `UiNode` snapshots. | M1–M3 (§12) can be computed on any machine and in CI. The emulator run remains the authoritative one; the simulator is a regression net. |
| D6 | All model output is grammar-constrained (GBNF) and re-validated by the C++ parser. | §9, §13: closed output space; the parser is the last line of defence when a backend ignores the grammar. |
| D7 | No third-party React Native libraries with native code in the demo app (own minimal stack navigator). | Every native library needs an RNOH port; avoiding them removes a whole class of build risk (S1). |

### Additive changes to the RFC contracts

Kept minimal and backwards-compatible; each one is documented in `docs/ARCHITECTURE.md`.

- `UiNode.a11y` gains optional `selected` and `checked` (the guide serialisation in §9 prints `selected`).
- `UiNode` gains optional `placeholder`, `runs` (per-fragment colour/size for mixed-style text, §6 "worst fragment"), `pressable` (plan B: JS registry reported a press handler) and `drawsImage` (gradient/image background → contrast "unknown", §7).
- `Snapshot` gains optional `error` and `partial` (§13 failure table).
- `audit()` returns a report object `{ findings, counts, contrastUnknown, partial, nodeCount }` instead of a bare `Finding[]`; `Waypoint.audit()` adds `rev`.
- Core module gains `finalize(rawSnapshotJson)`, `labelRequest(snapshotJson, nodeId)` and `validateLabel(snapshotJson, nodeId, label)` so label suggestions (§8) run through the same C++ code on device and host.
- `parseAction()` maps the model's candidate *index* to the React tag: it returns `{ a: 'tap', id: <tag>, index }` or `{ error }`.
- R6 skips images that sit inside *any* accessible ancestor: such an image is never focused on its own, and the unnamed ancestor is already reported by R1 (avoids double-counting one defect).

## 1. Repository layout (§11)

```text
README.md                         setup, build, install, launch, versions, licences
THIRD_PARTY.md                    pre-existing and third-party components, AI tools
docs/
  rfc/RFC-001-waypoint.md
  IMPLEMENTATION_PLAN.md          this file
  ARCHITECTURE.md                 from RFC §4–§11 + deviations above
  AI_WORKFLOW.md                  tools, prompts, review process, failed approaches
  AI_FEATURES.md                  model, inference flow, data handling, limits
  CONFORMANCE.md                  S4 screen-reader matrix (filled on the target)
  SPIKES.md                       S1–S4 procedures and result log
cpp/
  CMakeLists.txt                  host build: core lib, tests, CLI, optional llm
  core/include/waypoint/*.hpp     public headers
  core/src/*.cpp
  core/tests/                     unit tests + golden snapshots
  cli/waypoint_cli.cpp            host CLI used by eval and for debugging
  llm/                            LocalBackend on llama.cpp, SHA-256, tests
packages/waypoint-sdk/            JS/TS API, TurboModule specs, guide, overlay
harmony/waypoint/                 RNOH HAR: CMake, WaypointPackage, cxx + ArkTS modules
examples/demo-app/                React Native app with seeded defects
examples/demo-app/harmony/        native container, build-profile.json5 (API 20)
eval/                             tasks.json, defects.json, simulator, runners, results/
.github/workflows/ci.yml          host tests on every push
```

## 2. Work packages

Each package lists scope, files, acceptance criteria (AC) and tests. Order follows
the dependency graph, not the hackathon clock; §5 maps them onto the 24 h schedule.

### WP0 — Repository, CI, docs skeleton

- Root `README.md`, `THIRD_PARTY.md`, `docs/AI_WORKFLOW.md` (appended to from now on), `.gitignore`, `.editorconfig`.
- `.github/workflows/ci.yml`: job `cpp` (CMake + Ninja, `ctest`), job `js` (`npm ci`, `tsc --noEmit`, `jest`), job `eval-smoke` (simulator + lexical baseline backend).
- **AC:** a clean clone builds and tests with three commands from the README.

### WP1 — Core data model and JSON (§5)

- `json.hpp/.cpp`: value type, strict parser (UTF-8, escapes, numbers), compact serializer with stable key order.
- `model.hpp/.cpp`: `Rect`, `Rgba`, `A11y`, `UiNode`, `Snapshot`, `Finding`, `Action`, `AuditReport`; `toJson`/`fromJson` for each; tolerant of missing optional fields.
- `hash.hpp`: FNV-1a 64-bit; `rev` = hash over `(id, round(frame), name, text)` of every node, printed as 16 hex digits.
- **Tests:** JSON round-trip (escapes, unicode, nested), malformed input rejected with an error (never a crash), model round-trip, `rev` stable for identical snapshots and changes when a name changes (§12).

### WP2 — Colour and contrast (§7)

- `color.hpp/.cpp`: `parseHex`, `linearise`, `luminance`, `contrastRatio`, `compositeOver` (source-over with alpha).
- **Tests (exact vectors from §12):** black/white = 21; `#999999`/white = 2.85; `#767676`/white ≈ 4.54 passes; 50 % black on white = 3.98; nested translucent backgrounds; opacity multiplies alpha.

### WP3 — Tree Walker and finalize (§6)

- `walker.hpp`: `template <class Adapter> walk(...)` implementing the §6 pseudocode: absolute frame = origin + layout origin, child origin minus ScrollView content offset, clip intersection for clipping views, cumulative opacity, `visible = intersects(abs, clip) && display != none && opacity > 0`, cap at 500 nodes → `partial`.
- `raw_tree.hpp`: host `RawNode` + `RawAdapter` for tests and the CLI (`walk` subcommand reads a nested raw tree JSON).
- `finalize.cpp`:
  1. inherit `hidden` down the tree;
  2. modal occlusion — when a visible `ModalHostView` exists, nodes outside the last one's subtree become invisible;
  3. accessible name: label → own text (TextInput: value, else placeholder; `secureTextEntry` values are never emitted) → for `accessible` nodes the pre-order names of non-hidden descendants (a labelled/texted descendant contributes once, its subtree is skipped) → "";
  4. actionability: visible ∧ ¬hidden ∧ ¬disabled ∧ (interactive role ∨ component ∈ {TextInput, Switch} ∨ (accessible ∧ not a text node ∧ not an Image ∧ role not non-interactive) ∨ `pressable`);
  5. `rev`.
- **Tests:** frames through nested scroll views and clipping; opacity accumulation; invisible when clipped/`display:none`/opacity 0; names for label/text/grouped children/hidden children; actionability truth table; modal occlusion; 500-node cap.

### WP4 — Rule engine R1–R6 (§7)

- `rules.hpp/.cpp` with `AuditOptions { windowBg = white, largeTextVp = 24, largeBoldVp = 18.66 }`.
  - R1 actionable ∧ empty name → error; `data` carries component, w, h, imageSrc (own or first descendant image).
  - R2 actionable ∧ min(w,h) < 24 → error, < 44 → warning.
  - R3 text nodes: effective background = window bg composited with each ancestor's (and own) `bg`, alpha × cumulative opacity; text colour composited on top; image/gradient behind the text → `unknown` (counted, no finding); mixed runs → worst run; threshold 4.5, or 3.0 for large text. `data` carries the ratio (2 decimals), threshold, fg/bg hex.
  - R4 actionable ∧ no role ∧ component `View` → warning.
  - R5 visible actionable nodes sharing a non-empty name (case-insensitive) → warning on every occurrence after the first.
  - R6 `Image` ∧ ¬hidden ∧ empty name ∧ no accessible ancestor → warning.
- `audit()` returns findings in pre-order, then by rule id, plus counts.
- **Tests:** one positive and one negative per rule; thresholds at the boundary (23.9/24/43.9/44 vp; 4.49/4.5); clean golden snapshot → zero findings; defective golden snapshot → exactly the expected findings.

### WP5 — Label suggestions (§8)

- `labels.hpp/.cpp`: `buildLabelContext` (component, role, image/testID/nativeID basenames, ≤3 named neighbours before/after in pre-order excluding the node's own subtree, nearest named ancestor, screen title = largest text in the top 120 vp); `labelRequest` → `{ system, prompt, grammar, fallback }`; `validateLabel` (generic list, collides with any visible actionable name, bare file-name echo); `humanise("ic_gear") → "Gear"`; patch string.
- **Tests:** prompt bytes for the §8 example; each validator rejection; fallback humanisation; grammar text equals the §8 GBNF.

### WP6 — Guide planner, grammar and parser (§9, §13)

- `planner.hpp/.cpp`:
  - candidates = visible actionable nodes in reading order; destructive names (delete, remove, pay, send, log out, sign out, buy) only if they share a word with the goal; if more than K = 24, keep tabs and back controls and the top-scoring rest by `0.6·J_word + 0.4·J_tri`, then restore reading order;
  - name sanitising: control characters removed, whitespace collapsed, quotes replaced, cut at 60 chars;
  - serialisation exactly as §9 (`[i] role "name" selected`), screen title, last four history entries;
  - per-step GBNF with one `id` alternative per candidate; `scroll` only when a ScrollView has visible-clipped content in that direction (`up`/`down` offered independently); `back` unless the caller says it cannot go back; `done`, `ask` always; no `tap` rule when there are no candidates; `stop: "no-candidates"` when nothing but `done`/`ask` remains.
  - static system prompt kept byte-identical between steps so llama.cpp can reuse the KV prefix.
- `action.cpp`: `parseAction(text, candidates)` — strict JSON, known `a`, integer id within range, `dir` ∈ {up, down}; maps index → tag.
- **Tests:** n candidates → exactly n alternatives; K-cap keeps tabs/back; scoring order; destructive gating; sanitising; out-of-range id, unknown action, trailing garbage rejected; scroll detection.

### WP7 — Host CLI

- `waypoint-cli finalize|audit|plan|parse|label-request|validate-label|walk|contrast`; JSON on stdin or file, JSON on stdout, exit code ≠ 0 with `{ "error" }` on failure.
- Used by the evaluation harness (`eval/src/cliCore.ts`) so the host numbers come from the same C++ code as the device.

### WP8 — JS SDK `waypoint-sdk` (§10, §11)

- `types.ts` mirrors §5 (+ additive fields).
- `specs/NativeWaypointCore.ts`, `NativeWaypointLlm.ts`, `NativeWaypointPlatform.ts` (codegen-style specs, `TurboModuleRegistry.get`).
- `core.ts`: `CoreApi` interface + `NativeCore` wrapper that parses JSON and converts native exceptions into `Snapshot.error`.
- `llm/`: `LlmBackend` interface; `RemoteBackend` (llama-server `/completion`: `grammar`, `temperature 0`, `cache_prompt`, `seed`, `n_predict`; 8 s timeout via `AbortController`; release builds reject non-loopback URLs unless `allowNonLoopback`); `LocalBackend` (native module, `load` → false falls back to remote if configured); `withLogging` decorator writing the §10 JSON line (off by default).
- `guide/GuideSession.ts`: states `idle → planning → showing → (planning | done | asked | stopped)`; stop on `done`, `ask`, 8 steps, repeated `(rev, action)`, backend error; parse failure → retry ×2 → `ask`; reply discarded when `rev` changed during inference (bounded to 3 discards); waits for `rev` change with 300 ms polling, reminder at 20 s, `ask` at 40 s; captions from templates.
- `audit/suggest.ts`: runs `labelRequest` → backend → JSON parse → `validateLabel`; fallback label with `confidence: 'low'` when the backend is missing or fails.
- React layer: `WaypointProvider` (backend config, override store, surfaceId from `RootTagContext`), `useGuide`, `GuideOverlay` (highlight ring + caption), `AuditOverlay` + panel (`__DEV__` only), `useWaypointOverride(testID)`, `Waypoint.audit()`.
- `overlay/geometry.ts`: pure ring/caption placement (padding, viewport clamping, caption above/below).
- **Tests (Jest):** GuideSession with scripted backends and fake clock (happy path, step limit, loop detection, timeout reminder → ask, grammar violation retries, rev change during inference, backend down); geometry; RemoteBackend request body and timeout; suggestion pipeline incl. fallback; override store.

### WP9 — Local inference `cpp/llm` (§10)

- `LocalBackend`: `load(path, nCtx=2048, nThreads=4, expectedSha256?)`, `complete(system, prompt, grammar, maxTokens)` with grammar sampler → greedy, KV-prefix reuse (longest common token prefix, `llama_memory_seq_rm` for the tail), EOG/`maxTokens` stop, timings; `unload`.
- `sha256.hpp/.cpp` (self-contained) for the model checksum.
- llama.cpp pinned by commit in `cpp/llm/LLAMA_CPP_COMMIT` and fetched by CMake (`FetchContent`), option `WAYPOINT_WITH_LLAMA`.
- **Tests:** SHA-256 vectors; load of a missing file returns false; grammar-constrained generation on a tiny random-weight GGUF generated in the test produces output that `parseAction` accepts (proves the constraint, not the model's quality).

### WP10 — RNOH integration `harmony/waypoint` (§11)

- HAR module (`oh-package.json5`, `build-profile.json5`, `hvigorfile.ts`, `module.json5`), `src/main/cpp/CMakeLists.txt` adding `cpp/core` (+ `cpp/llm` when `WAYPOINT_WITH_LLAMA`).
- `WaypointPackage.h`: `TurboModuleFactoryDelegate` creating `WaypointCore` and `WaypointLlm` (C++), and the ArkTS `WaypointPlatform` module.
- `WaypointCoreTurboModule.cpp`: `snapshot(surfaceId)` via `UIManagerBinding::getBinding(rt)->getUIManager().getShadowTreeRegistry().visit(...)`, wrapped in try/catch → error snapshot; the other methods delegate to the core.
- `ShadowTreeAdapter.h`: `ShadowNode` → raw fields (layout metrics, `ViewProps`, paragraph fragments, image source, TextInput value/placeholder/secure, ScrollView content offset).
- `WaypointLlmTurboModule.cpp`: worker thread + `CallInvoker` promise resolution.
- `ets/WaypointPlatformTurboModule.ets`: TextToSpeech (`@kit.CoreSpeechKit`) and `accessibility.isOpenAccessibilitySync()` (stretch).
- **AC (on DevEco only — cannot be executed in CI):** S1/S2 pass; demo app snapshot of each screen equals its golden file within frame tolerance.

### WP11 — Demo app `examples/demo-app` (§12)

- Screens: Home, Tickets, Ticket type, Ticket history, Profile, Edit profile, Settings, Display, Font size, Notifications, Language, Privacy, Privacy policy, Support, Contact, Log-out confirmation.
- Bottom tab bar (Home, Tickets, Profile, Settings) with icon-only tabs — the central defect of the demo.
- 20 seeded defects matching §12: 8×R1, 4×R2, 4×R3, 2×R4, 1×R5, 1×R6, listed in `eval/defects.json` by `testID`.
- Labels resolved through `useWaypointOverride(testID)` with a mode switch: A (defective), B (accepted suggestions), C (hand-written labels).
- Test-only eval hook (`src/eval/autopilot.ts`, compiled only when `WAYPOINT_EVAL` is set) that presses what the guide highlighted.
- RNOH container in `examples/demo-app/harmony/` with API 20 compile/target/min SDK and `abiFilters: ["arm64-v8a", "x86_64"]`.

### WP12 — Evaluation harness `eval/` (§12)

- `tasks.json` (10 tasks × 3 phrasings, target `testID`), `defects.json` (20 defects, accepted labels for R1).
- `src/simulator.ts`: renders a screen of the shared spec into raw nodes with the same layout constants as the app, applies taps/back/scroll, finalizes through the CLI.
- `src/runGuide.ts`: M1 over conditions A, B, C with any backend (`remote` llama-server, `lexical` deterministic baseline for CI); success = target `testID` visible within 8 steps (the model's `done` claim is ignored); writes JSONL logs.
- `src/runAudit.ts`: M2 per rule (recall, precision) and M3 label acceptance; M5 snapshot timing on the largest screen.
- `src/stats.ts`: Wilson interval (test: 24/30 → centre 0.766, half-width 0.139).
- `src/report.ts` → `eval/results/results.md`.
- Device runs reuse the same `GuideSession` and log format; their JSONL goes to `eval/results/device/`.

### WP13 — Documentation and release (§15 deliverables)

- `docs/ARCHITECTURE.md`, `docs/AI_FEATURES.md`, `docs/AI_WORKFLOW.md`, `docs/CONFORMANCE.md`, `docs/SPIKES.md`, README version pins, `THIRD_PARTY.md`, demo script.
- Release: `.hap` built in DevEco, tag `v0.1.0`, recorded video.

## 3. Test matrix (§12)

| Level | Where | What | Runs in CI |
| --- | --- | --- | --- |
| C++ unit | host | WP1–WP7, WP9 sha/load | yes |
| C++ golden | host | audit of every simulated demo screen in A and C | yes |
| JS unit | host (Jest) | WP8 | yes |
| Eval smoke | host | simulator + lexical backend, A/B/C, audit recall | yes |
| Eval full | laptop + llama-server | M1–M4 with the chosen model | manual |
| Device | emulator/device API 20 | S1–S4, golden snapshots, screen-reader checklist, M4/M5 | manual |
| Failure paths | host | backend down, grammar violation, zero candidates, 500 nodes | yes |

## 4. What cannot be verified in this repository's CI

Stated up front so nobody mistakes "compiles on Linux" for "runs on HarmonyOS":

- Everything under `harmony/` and `examples/demo-app/harmony/` needs DevEco Studio, the HarmonyOS SDK (API 20) and the RNOH headers. The C++ there is written against upstream React Native 0.77 names; spike S2 confirms or corrects them.
- The ArkTS module and the `.hap` build.
- Screen-reader behaviour (S4, `CONFORMANCE.md`).
- Model quality numbers (M1 with a real model, M3, M4) need a GGUF model, which this repository does not contain.

## 5. Schedule (maps to RFC §15)

| Hours | Work packages | Exit criterion |
| --- | --- | --- |
| 0–2 | WP0, spikes S1–S4 (`docs/SPIKES.md`) | Go/no-go recorded |
| 2–6 | WP1, WP3, WP11 skeleton, WP8 GuideSession + RemoteBackend | Guide runs on remote backend with ring |
| 6–10 | WP2, WP4 (R1–R3), WP5, overlay | Audit panel with suggestions |
| 10–14 | WP6 hardening, WP12, WP9 in parallel | `eval` produces A/B/C numbers |
| 14–18 | WP4 (R4–R6), model selection, fix top failure | Feature freeze at 18 |
| 18–21 | WP13, clean-clone build | Docs complete |
| 21–24 | `.hap`, video, tag, submit | Submitted |

## 6. Definition of done

- `cmake --build` + `ctest` green; `npm test` green in `packages/waypoint-sdk` and `eval`.
- `eval` smoke run reproduces SR(A) < SR(B) ≤ SR(C) with the lexical baseline and audit recall 20/20 on the simulated app.
- Every §13 failure row has a test or, for device-only rows, a checklist entry.
- No secrets, no model files, no generated binaries in git.
