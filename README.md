# Waypoint

**An accessibility auditor and on-device guide for React Native apps on HarmonyOS.**

Waypoint reads an app's own UI tree once and uses it twice. It **audits** the tree
for accessibility defects, and it **guides** a user to a goal ("make the text
bigger") with a small local language model that picks the next element from a
numbered list.

> **Thesis.** Accessibility metadata is the interface for screen readers *and* for
> AI agents. A well-labelled app can be navigated by a small local model; a badly
> labelled one cannot. Waypoint measures that gap and closes it.

## Beyond the RFC

- **Runs in a browser, no Huawei hardware needed.** `npm run web` (in `examples/demo-app`)
  serves CityRide with Waypoint: react-native-web screens, the C++ core as WebAssembly,
  speech through the Web Speech API, and an inspector that shows the score, the
  screen-reader transcript and the model's prompt for the current screen.
  [docs/WEB.md](docs/WEB.md)
- **Voice control** in English and Polish. Say "make the text bigger" or „co tu jest?”
  and Waypoint speaks each step with the element's position ("at the bottom left"),
  reads what is on the screen and how many controls have no name.
  [docs/VOICE.md](docs/VOICE.md)
- **Accessibility score and visual report.** Every audit carries a 0–100 score and
  the number of controls an assistant can tell apart. `npm run report` (in `eval/`)
  draws every screen from its snapshot with each finding boxed, before and after the
  fixes.
- **Autofix.** `waypoint-fix` writes accepted labels into the source next to the
  matching `testID`. [docs/AUTOFIX.md](docs/AUTOFIX.md)
- **Hear it like a screen reader.** The core lists every stop a screen reader makes and
  what it says ("Tab, selected. Tab. Tab."). The audit panel's Listen button speaks it;
  the voice command "read everything" / „przeczytaj wszystko” reads it out.
- **Focus order rule R8** (WCAG 2.4.3): warns when the reader jumps up, or left in a row.
- **Playground in the browser.** The C++ core compiled to WebAssembly (Zig, ~210 KB)
  runs in one self-contained page: name the demo app's controls and watch the score,
  the screen-reader transcript, the model's prompt and the reachable screens change.
  A parity test checks that the browser build answers byte for byte like the native
  core. `cpp/wasm/build.sh && (cd eval && npm run playground)`
- **Accessibility gate for CI.** `npm run gate` (in `eval/`) audits every screen against a
  committed baseline and fails on a lower score or a new finding, with a table in the
  GitHub job summary. It also takes snapshots pulled from a device (`--snapshots dir/`).
- **Where can an assistant go?** A crawler presses every control of the simulated app
  and maps the screens. Before the fixes an assistant reaches 3 of 19 screens by name;
  after them, 19 of 19. The report draws both maps and simulates colour-vision
  deficiencies on every screen.

Design: [RFC-001](docs/rfc/RFC-001-waypoint.md) · Plan: [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) ·
Architecture: [ARCHITECTURE.md](docs/ARCHITECTURE.md) · AI: [AI_FEATURES.md](docs/AI_FEATURES.md),
[AI_WORKFLOW.md](docs/AI_WORKFLOW.md) · Device checks: [SPIKES.md](docs/SPIKES.md), [CONFORMANCE.md](docs/CONFORMANCE.md)

## What is in the repository

| Path | What | Verified how |
| --- | --- | --- |
| `cpp/core` | Tree walker, rules R1–R6, guide planner, GBNF grammars, action parser, label suggestions. No dependencies. | 56 host tests under ASan/UBSan, including 39 golden snapshots |
| `cpp/llm` | On-device inference on llama.cpp (pinned commit), SHA-256 model check | Tests on a tiny random-weight GGUF: the grammar alone guarantees valid actions |
| `cpp/cli` | `waypoint-cli`: the core on the host, used by the evaluation | Exercised by every JS test |
| `packages/waypoint-sdk` | JS API, TurboModule specs, guide state machine, backends, audit and guide overlays | 70 Jest tests against the real C++ core |
| `harmony/waypoint` | RNOH package: shadow-tree adapter, `WaypointCore` and `WaypointLlm` cxxTurboModules, ArkTS `WaypointPlatform` | Syntax-checked against the React Native headers shipped in the RNOH 0.77.75 HAR; device build pending (S1/S2) |
| `examples/demo-app` | CityRide, a transit app with 20 seeded defects, plus its DevEco container (API 20) | Typecheck; Metro builds the HarmonyOS release bundle |
| `eval` | Simulator of the demo app, M1–M4 runners, Wilson intervals, `results.md`, HTML report, voice demo | 7 tests; CI smoke run with a non-LLM baseline |
| `packages/waypoint-fix` | Codemod that writes accepted labels into the source | 8 tests |

**Not verified in this repository:** anything that needs DevEco Studio, the
HarmonyOS SDK, an emulator or a device (the `.hap` build, the shadow-tree read on
RNOH, the screen reader), and results with a real language model. These are
scripted in [docs/SPIKES.md](docs/SPIKES.md) and [eval/README.md](eval/README.md).

## Quick start on the host (Linux or macOS)

Requirements: CMake ≥ 3.16, Ninja, a C++17 compiler, Node 22.

```sh
# C++ core, CLI and tests
cmake -S cpp -B cpp/build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build cpp/build && ctest --test-dir cpp/build

# SDK tests (they call cpp/build/waypoint-cli)
(cd packages/waypoint-sdk && npm ci && npm test)

# Evaluation without a model: audit recall/precision and the baseline guide
(cd eval && npm ci && npm run all -- --backend lexical)

# On-device inference backend (fetches the pinned llama.cpp commit)
cmake -S cpp -B cpp/build-llm -G Ninja -DCMAKE_BUILD_TYPE=Release -DWAYPOINT_WITH_LLAMA=ON
cmake --build cpp/build-llm && ctest --test-dir cpp/build-llm
```

## Run the demo in a browser

No DevEco Studio, emulator or Huawei device needed; see [docs/WEB.md](docs/WEB.md).

```sh
cpp/wasm/build.sh   # needs zig: pip install ziglang
(cd packages/waypoint-sdk && npm ci)
cd examples/demo-app && npm ci && npm run web   # http://127.0.0.1:8081
```

## Build and run the demo on HarmonyOS

Requirements: DevEco Studio 6 with the HarmonyOS SDK at API 20, an emulator or a
device, Node 22.

1. Install JS dependencies and build the bundle:
   ```sh
   (cd packages/waypoint-sdk && npm ci)
   cd examples/demo-app && npm ci
   npm run bundle:harmony
   ```
2. Open `examples/demo-app/harmony` in DevEco Studio. It runs `ohpm install`, which
   pulls the RNOH HAR from `node_modules` and the Waypoint package from
   `harmony/waypoint`. Compile, target and minimum SDK are API 20 (`6.0.0(20)`); ABI
   filters are `arm64-v8a` and `x86_64` (the emulator needs the latter).
3. Configure signing (File → Project Structure → Signing Configs → automatic).
4. Run `entry`. The app starts on CityRide's Home screen.
5. Model, choose one:
   - **Remote (development):** on the laptop run
     `llama-server -m <model>.gguf --port 8080 --temp 0 --seed 0`, then
     `hdc rport tcp:8080 tcp:8080`. The app calls `http://127.0.0.1:8080`.
   - **Local:** rebuild with `-DWAYPOINT_WITH_LLAMA=ON` in
     `harmony/entry/build-profile.json5`, then
     `hdc file send <model>.gguf /data/storage/el2/base/files/model.gguf`.
     When the file is missing the app falls back to the remote backend
     (`src/config.ts`).
6. Demo: press **Guide**, type "make the text bigger" (the guide stalls on the
   unnamed tabs). Press **A11y** for the audit, then **Accept all**, and ask again.

Without a working shadow-tree read (spike S2) the walker's error appears in the
overlay and the plan B registry applies; see [ARCHITECTURE.md](docs/ARCHITECTURE.md#plan-b).

## Results

Host simulator, condition A/B/C, 30 trials each (`eval/results/`):

| Backend | SR(A) | SR(B) | SR(C) | Audit recall | Audit precision |
| --- | --- | --- | --- | --- | --- |
| Lexical baseline, not a model | 0/30 | 5/30 | 5/30 | 20/20 | 20/20 |
| Language model via llama-server | *to run:* `npm run all -- --backend remote` | | | | |

Even the keyword baseline cannot pick among four tabs named "", which is the
thesis in its simplest form. The model run, its interval and its latency are the
headline numbers. They go in `eval/results/remote-<model>/results.md` and in this
table.

## Versions to pin

| Component | Version |
| --- | --- |
| React Native | 0.77.1 (the peer version of RNOH 0.77.75) |
| RNOH (`@react-native-oh/react-native-harmony`, `-cli`) | 0.77.75 |
| HarmonyOS SDK | API 20 (`6.0.0(20)`) |
| DevEco Studio | *record on first build* |
| Emulator image or device, OS build | *record during S1* |
| Node | 22 |
| llama.cpp | `cpp/llm/LLAMA_CPP_COMMIT` |
| Model file, quantisation, SHA-256 | *record after model selection* |

## Security and privacy in one paragraph

Screen text is untrusted input. The model can only answer inside a grammar that
lists the on-screen indices and four fixed actions, the parser re-checks every
reply, names are sanitised and cut to 60 characters, destructive controls are
offered only when the goal mentions them, and the guide never taps. In local mode
nothing leaves the device; release builds refuse non-loopback model URLs unless
the integrator opts in. No API keys exist in the project. Details:
[AI_FEATURES.md](docs/AI_FEATURES.md).

## Third-party components and AI tools

See [THIRD_PARTY.md](THIRD_PARTY.md) and [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md).
