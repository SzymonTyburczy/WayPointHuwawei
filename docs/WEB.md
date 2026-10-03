# CityRide with Waypoint in a browser

The demo app and Waypoint run in one web page, with no HarmonyOS SDK, emulator or
device. The React Native screens render through react-native-web; the Waypoint core
is the same C++ compiled to WebAssembly (`cpp/wasm`).

```sh
cpp/wasm/build.sh                       # once; needs zig: pip install ziglang
(cd packages/waypoint-sdk && npm ci)
cd examples/demo-app && npm ci
npm run web                             # http://127.0.0.1:8081, rebuilds on change
npm run web:build                       # web/dist/standalone.html, one file that opens from disk
```

## What the page has

- The phone: CityRide with the **Guide** button, the **A11y** audit panel and the voice
  button, exactly as on a device. You tap; the guide never does.
- **Build** controls, each a rebuild of the device app: labels as shipped (condition A)
  or labelled by hand (C); the guide's chooser (keyword baseline or a llama-server);
  voice commands typed or spoken; spoken replies.
- An inspector beside the phone, refreshed whenever the screen changes: the score and
  rule counts, the screen-reader transcript (hover a line to see the element), and the
  exact prompt and grammar the model would get for a goal.

## How it maps to the device

| Device | Web |
| --- | --- |
| `WaypointCore` cxxTurboModule | `web/src/webModules.ts`: the wasm core, same JSON commands as `waypoint-cli` |
| Shadow-tree walker | Not available; Waypoint reads the registered targets (plan B, `useWaypointTarget`) |
| `WaypointLlm` (llama.cpp) | Absent; keyword baseline, or llama-server through `RemoteBackend` |
| `WaypointPlatform` (Core Speech Kit) | Web Speech API: `speechSynthesis`, `SpeechRecognition` |
| `react-native` | `web/src/rn-shim.ts`: react-native-web, `TurboModuleRegistry`, `RootTagContext`, a 360 × 780 window |
| `src/config.ts` | `web/src/config.web.ts`, changed by the page's controls |

Plan B sees only what the app registers, so icons inside buttons do not count as
images and a screen's score can differ by a few points from the walker's. The
findings are the same.

## With a language model

The keyword baseline is a floor, not a result: it taps whatever overlaps the goal's
words and never answers `done`. For a model, serve the page locally and run

```sh
llama-server -hf ggml-org/Qwen3-1.7B-GGUF --port 8080 --temp 0 --seed 0
```

then pick **llama-server** in the page. The published copy of the page cannot reach a
server on your machine.

## Speech

Typed commands work everywhere. The microphone needs a browser with
`SpeechRecognition` (Chrome, Edge, Safari) and a page that is allowed to listen; an
embedded copy of the page is not.
