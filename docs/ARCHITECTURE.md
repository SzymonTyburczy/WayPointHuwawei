# Waypoint architecture

This document describes what is built. It follows RFC-001 §4–§11 and records every
place where the implementation differs from the RFC.

## Layers

```text
┌──────────────────────── JavaScript (packages/waypoint-sdk) ───────────────────────┐
│ WaypointProvider · useGuide · GuideOverlay · AuditOverlay · useWaypointOverride   │
│ GuideSession (state machine) · suggestLabels · RemoteBackend · LocalBackend       │
│ TargetRegistry (plan B)                                                            │
└──────────────┬───────────────────────────────┬────────────────────────────────────┘
               │ JSI, synchronous (JSON)       │ JSI, promises (worker thread)
┌──────────────▼──────────────┐ ┌──────────────▼──────────────┐ ┌──────────────────┐
│ WaypointCore cxxTurboModule │ │ WaypointLlm cxxTurboModule  │ │ WaypointPlatform │
│ harmony/waypoint/src/main/  │ │ cpp/llm LocalBackend        │ │ ArkTS (TTS,      │
│ cpp + ShadowTreeAdapter     │ │ llama.cpp, pinned commit    │ │ screen reader)   │
└──────────────┬──────────────┘ └─────────────────────────────┘ └──────────────────┘
┌──────────────▼──────────────────────── C++ core (cpp/core) ────────────────────────┐
│ TreeWalker<Adapter> → finalize() → audit() R1–R6 · planStep() + GBNF · parseAction │
│ labelRequest() / validateLabel() · api:: string facade · JSON · no dependencies     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

The ShadowTreeAdapter is the only code that touches React Native internals.
Everything downstream consumes the flat `UiNode[]` snapshot, so the rules and the
planner are tested on plain JSON on the host (`cpp/core/tests`, 39 golden snapshots).
The same core is compiled into `waypoint-cli`, which the Jest tests and the
evaluation harness call, so host numbers come from the device code.

## Data model (RFC §5)

`cpp/core/include/waypoint/model.hpp` and `packages/waypoint-sdk/src/types.ts`
mirror each other. Additions to the RFC contract, all optional and backwards-compatible:

| Field | Why |
| --- | --- |
| `a11y.selected`, `a11y.checked` | The §9 serialisation prints `selected`. Both also enter `rev`, so a toggled switch is a screen change the guide can verify. |
| `placeholder` | A TextInput's accessible name falls back to it. |
| `runs` | Per-fragment colour and size for mixed-style paragraphs; R3 checks the worst run (§6). |
| `pressable` | Plan B: the registry saw a press handler (§6 actionability, last bullet). |
| `drawsImage` | Gradient or image background; contrast becomes "unknown" (§7). |
| `Snapshot.error`, `Snapshot.partial` | §13: an empty snapshot with an error code; capped traversal. |

## Tree walker (RFC §6)

`walker.hpp` implements the §6 pseudocode once, as a template over an adapter:

- absolute frame = parent origin + layout origin; children of a ScrollView are
  shifted by its content offset;
- clipping views (`overflow: hidden`, ScrollView) intersect the clip rectangle;
- opacity multiplies down the tree; `display: none` hides the subtree;
- `visible` = intersects the clip ∧ displayed ∧ opacity > 0;
- traversal stops at 500 nodes and flags the snapshot `partial`.

`ShadowTreeAdapter.h` reads `LayoutableShadowNode::getLayoutMetrics()`,
`ViewProps` (background, opacity, accessibility props, `testId`, `nativeId`),
the paragraph state's attributed string (text, colour, size, weight per fragment)
and `ImageProps::sources`. TextInput values are never read (privacy; §13), and
Paragraph children are not walked because their text is already collected.
`harmony/tools/check_rnoh_headers.sh` compiles this adapter against the
React Native headers that ship inside the RNOH 0.77.75 HAR; spike S2 confirms it
on a device.

### finalize()

One function derives everything that is not read from the tree, so the walker and
plan B produce identical semantics:

1. drop Waypoint's own overlay (`nativeID="waypoint-overlay"`);
2. inherit `hidden` down the subtree;
3. modal occlusion: with a `ModalHostView` mounted, only its subtree stays visible;
4. accessible name: label → own text (TextInput: placeholder) → for accessible
   nodes, the descendants' contributions in pre-order, a labelled descendant
   counting once → "";
5. actionability: visible ∧ ¬hidden ∧ ¬disabled ∧ (interactive role ∨ TextInput/Switch ∨
   accessible non-text, non-image node without a non-interactive role ∨ `pressable`);
6. `rev` = FNV-1a 64 over (id, rounded frame, name, text, checked, selected).

The C++ entry points always call `finalize()` on their input; it is idempotent.

### Plan B

When the walker reports an error, `WaypointRuntime.takeSnapshot()` falls back to
the `TargetRegistry`: components call `useWaypointTarget(info)` and attach the
returned ref; frames come from `measureInWindow`; the records are sorted into
reading order and finalized by the same C++ code. The tree is flat, so names come
from what each component declares. The demo app registers every control.

## Audit engine (RFC §7)

`rules.cpp`. Thresholds: 24 vp error / 44 vp warning (R2), 4.5:1 or 3:1 for large
text (≥ 24 vp, or ≥ 18.66 vp bold) (R3). Contrast composites every ancestor
background with alpha × cumulative opacity over the window colour, then the text
colour over that; an image or gradient behind the text makes the result "unknown"
(counted in `contrastUnknown`, no finding). The RFC worked examples (2.85 and 3.98)
are unit tests.

Deviations:

- **R5** reports every occurrence after the first, with `firstNodeId`, so one
  duplicate is one finding.
- **R6** skips images inside *any* accessible ancestor. Such an image is never
  focused on its own; if the ancestor is unnamed, R1 already reports it. The RFC
  says "no named accessible ancestor", which double-counts icon buttons.

## Label suggestions (RFC §8)

`labels.cpp` builds the bounded context (component, role, image basename, testID,
nativeID, three named reading units before and after, nearest named ancestor,
screen title), the prompt and the §8 grammar. The validator rejects generic labels,
duplicates of any visible actionable name, and bare echoes of the file name
(`Ic gear`). Without a model the fallback is the humanised basename (`ic_gear` →
`Gear`) with confidence `low`. Release-bundle asset names such as
`src_assets_icons_ic_gear` humanise to the same label.

## Guide (RFC §9)

`planner.cpp` selects visible actionable candidates in reading order, gates
destructive names (delete, pay, send, log out, …) unless the goal shares a word,
caps at K = 24 by `0.6·J_word + 0.4·J_tri` while keeping tabs and back controls,
sanitises names (no control characters or quotes, 60 characters), and emits the
§9 serialisation plus an `ALSO:` line listing scroll and back when they apply.
The grammar has one `id` alternative per candidate; `scroll` appears only when a
ScrollView has clipped content in that direction, `back` only when the app says
it can go back, and `tap` disappears when nothing can be tapped. `parseAction`
rejects anything outside that shape and maps the index to the React tag.

`GuideSession.ts` runs the loop: snapshot → plan → one model call (8 s timeout) →
discard the reply if `rev` changed meanwhile → parse (two retries, then `ask`) →
loop detection on (rev, action) → highlight → poll `rev` every 300 ms → repeat the
caption after 20 s → `ask` after 40 s. It stops on `done`, `ask`, 8 steps, a loop, a
backend failure or a walker error. Captions come from templates and use the
candidate's sanitised name, never raw screen text.

## LLM runtime (RFC §10)

| Backend | Where | Notes |
| --- | --- | --- |
| `RemoteBackend` | SDK | llama-server `/v1/chat/completions` with `grammar`, `temperature 0`, `top_k 1`, `seed`, `cache_prompt`; 8 s timeout; release builds refuse non-loopback URLs unless `allowNonLoopback`. |
| `LocalBackend` | `cpp/llm` + `WaypointLlm` | llama.cpp; the model's chat template (ChatML fallback); grammar sampler then greedy; the longest common token prefix stays in the KV cache, so guide steps evaluate only the new suffix; SHA-256 check at load; a dedicated worker thread; promises resolve through the JS call invoker. |
| `FallbackBackend` | SDK | Local when the model loads, otherwise remote, otherwise none (§13). |
| `LoggingBackend` | SDK | One JSON line per call: prompt, grammar, output, tokens, ms, backend, model. Off by default. |

## Public API (RFC §11)

```tsx
<WaypointProvider backend={{ kind: 'remote', url: 'http://127.0.0.1:8080' }} canGoBack={() => stack.length > 1}>
  <App />
  {__DEV__ && <AuditOverlay />}
</WaypointProvider>

const { start, stop, status, caption, target } = useGuide();
const report = await Waypoint.audit(); // { rev, findings, counts, contrastUnknown, partial, nodeCount }
const label = useWaypointOverride('tab-settings');
const ref = useWaypointTarget<View>({ testID, role: 'button', label, pressable: true }); // plan B
```

TurboModule specs live in `packages/waypoint-sdk/src/specs`. Compared with the RFC,
`WaypointCore` adds `finalize`, `labelRequest` and `validateLabel`, so label
suggestions use the same C++ on device and host; `audit` returns a report object;
`WaypointLlm.load` takes the expected SHA-256 and `complete` resolves to JSON with
token counts and timing.

## HarmonyOS integration

- `harmony/waypoint` is an ohpm HAR. Its `src/main/cpp/CMakeLists.txt` builds
  `rnoh_waypoint` from `cpp/core` (and `cpp/llm` with `-DWAYPOINT_WITH_LLAMA=ON`).
- `WaypointPackage.h` registers `WaypointCore`, `WaypointLlm` and the ArkTS
  `WaypointPlatform`; the app's `PackageProvider.cpp` and `PackageProvider.ets`
  add it next to the autolinked packages.
- `examples/demo-app/harmony` is the RNOH 0.77.75 `init-harmony` template with
  API 20 compile/target/minimum SDK and `abiFilters: ["arm64-v8a", "x86_64"]`.
- Permissions: `ohos.permission.INTERNET` for the remote backend only.

## Robustness (RFC §13)

| Failure | Where handled | Test |
| --- | --- | --- |
| Walker throws or surface missing | `WaypointCoreTurboModule::snapshot` → error snapshot; plan B fallback | `audit.test.ts`, `registry.test.ts`, `guide.test.ts` |
| Backend unreachable or > 8 s | `withTimeout`, `BackendError` | `guide.test.ts`, `backends.test.ts` |
| Model missing or broken | `LocalBackend::load` → false; `FallbackBackend` | `test_llm.cpp`, `backends.test.ts` |
| Reply violates the grammar | `parseAction`; two retries, then `ask` | `test_planner_labels.cpp`, `guide.test.ts` |
| Screen changed during inference | `rev` compared after the reply | `guide.test.ts` |
| No candidates | `plan.stop = "no-candidates"` | `test_planner_labels.cpp`, `guide.test.ts` |
| More than 500 nodes | walker cap, `partial` | `test_walker.cpp` |
| Prompt injection in screen text | grammar, sanitising, destructive gating, the guide never taps | `test_planner_labels.cpp` |
