# Pre-existing and third-party components

Everything not listed here was written for this project.

## Used at runtime

| Component | Version | Licence | Use |
| --- | --- | --- | --- |
| React Native | 0.77.1 | MIT | App framework; upstream headers for the shadow-tree adapter |
| React | 18.3.1 | MIT | UI |
| React Native for OpenHarmony (`@react-native-oh/react-native-harmony`, RNOH HAR) | 0.77.75 | MIT | HarmonyOS runtime for React Native |
| llama.cpp / ggml | commit in `cpp/llm/LLAMA_CPP_COMMIT` | MIT | On-device inference (optional build) |
| Language model (GGUF) | chosen during evaluation | per model card | Guide and label suggestions; not in the repository |

## Used at build or test time

| Component | Licence | Use |
| --- | --- | --- |
| `@react-native-oh/react-native-harmony-cli` 0.77.75 and its project template | MIT | `bundle-harmony`, codegen; `examples/demo-app/harmony` was created from its `init-harmony` template |
| `@react-native-community/cli`, Metro, `@react-native/*` presets | MIT | Bundling |
| TypeScript | Apache-2.0 | Type checking |
| Jest, ts-jest | MIT | SDK tests |
| tsx | MIT | Running the evaluation harness |
| CMake, Ninja | BSD-3-Clause / Apache-2.0 | Native builds |
| folly, glog, boost, fmt, double-conversion (inside the RNOH HAR) | Apache-2.0 / BSD / BSL-1.0 / MIT | Only for `harmony/tools/check_rnoh_headers.sh` |

## Assets

The demo app's icons and banner are drawn by `examples/demo-app/tools/make_icons.py`
in this repository. The template's launcher images under
`examples/demo-app/harmony` come from the RNOH template.

## Written for this project

`cpp/core` (including its JSON parser and test harness), `cpp/cli`, `cpp/llm`
(including SHA-256), `packages/waypoint-sdk`, `harmony/waypoint`,
`examples/demo-app/src`, `eval`, and the documentation.

## AI tools

Claude Code (Anthropic) was used throughout; see [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md).
