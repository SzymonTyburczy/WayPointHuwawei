# Evaluation harness

Computes the numbers in RFC-001 §12 on the host, against a simulator of the demo
app that renders the same screen spec (`examples/demo-app/src/app/spec.ts`) as
the React Native app and is finalized, audited and planned by the real C++ core
through `waypoint-cli`.

| Metric | Command | Needs a model |
| --- | --- | --- |
| M1 guide success, conditions A/B/C, Wilson 95% CI | `npm run all` | yes (or the lexical baseline) |
| M2 audit recall/precision per rule | `npm run audit` | no |
| M3 label acceptance | `npm run audit` | yes (fallback labels otherwise) |
| M4 step latency | `npm run all` | yes |
| M5 snapshot time | device only, see `docs/SPIKES.md` | — |

## Setup

```sh
cmake -S ../cpp -B ../cpp/build-release -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build ../cpp/build-release
npm ci
export WAYPOINT_CLI=$PWD/../cpp/build-release/waypoint-cli
```

## Run with a model (the real result)

```sh
# 1. Serve a GGUF model with llama.cpp (pin the commit in cpp/llm/LLAMA_CPP_COMMIT)
llama-server -m qwen3-1.7b-q4_k_m.gguf --port 8080 -c 4096 --temp 0 --seed 0
# 2. Run all metrics; results land in results/remote-<model>/
npm run all -- --backend remote --url http://127.0.0.1:8080 --model qwen3-1.7b-q4_k_m
```

Model selection (RFC §10): repeat step 2 for each candidate and keep the smallest
model with the best SR(B). Commit `results/<run>/` (results.md, trials.jsonl,
audit.json).

## Run without a model

```sh
npm run all -- --backend lexical   # CI smoke run; a floor, not a model result
npm run audit -- --backend none    # M2 and fallback-only M3
```

## Protocol

1. Model, temperature 0 and seed are fixed and recorded in `results.md`.
2. Condition A: the defective app. 10 tasks × 3 phrasings, start on Home.
3. The audit runs over every screen; every suggestion that passed validation is
   accepted into the override store → condition B.
4. Condition C uses the hand-written labels (`handLabel` in the spec).
5. A trial succeeds when the task's target `testID` is visible within 8 steps.
   The model's own `done` is ignored. The autopilot presses exactly what the
   guide highlighted; it lives here and in the demo app, never in the SDK.

## Golden snapshots

`npm run golden` re-renders every screen in A and C into
`cpp/core/tests/golden/demo_*`, with the expected findings derived from
`defects.json`. The C++ test suite then asserts that the audit finds exactly the
seeded defects on every screen.
