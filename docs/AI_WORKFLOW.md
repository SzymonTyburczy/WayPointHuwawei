# AI workflow

How AI tools were used to build Waypoint, what was checked by hand, and what went
wrong. Append to this file as work continues (RFC §15, phase 1).

## Tools

| Tool | Use |
| --- | --- |
| Claude Code (Anthropic), cloud session | Implementation plan, all code in the first version, tests, documentation |
| The Waypoint guide's own model (GGUF via llama.cpp) | Runtime feature, not a development tool; see [AI_FEATURES.md](AI_FEATURES.md) |

## Workflow

1. **Input.** RFC-001 was written by the team and given to Claude Code verbatim
   (`docs/rfc/RFC-001-waypoint.md`).
2. **Plan first.** Claude wrote `docs/IMPLEMENTATION_PLAN.md`: work packages with
   acceptance criteria, a test matrix, the list of what cannot be verified without
   a device, and every deviation from the RFC contract.
3. **Bottom-up, test-first where the RFC gives numbers.** C++ core → SDK → evaluation
   → native packages → demo app → documentation, one commit per work package. The
   RFC's worked examples (contrast 2.85 and 3.98, `#767676` ≈ 4.54, the §8 prompt,
   the §9 serialisation, Wilson 24/30 → 63–90 %) became exact unit tests.
4. **Verification by execution, not by reading.** Every claim in the README's
   "verified how" column comes from a command that was run: sanitizer builds,
   ctest, Jest against the real C++ core, the evaluation, a Metro HarmonyOS
   bundle, a llama.cpp build with a generated model, and a compile of the
   TurboModules against the React Native headers inside the RNOH HAR.
5. **Look things up instead of recalling them.** RNOH's TurboModule context,
   `ARK_ASYNC_METHOD_METADATA`, `RNOHPackage`, the `init-harmony` template, the peer
   React Native version (0.77.1) and React Native 0.77's `AccessibilityState` were
   read from the published packages, not written from memory.

## Main prompts

- "This is the project's RFC: prepare a detailed and complete implementation plan,
  then implement it; push the RFC to the repository and start working." (original
  request, in Polish)
- The guide and label prompts the product itself sends are in
  `cpp/core/src/planner.cpp` (`kGuideSystemPrompt`) and `cpp/core/src/labels.cpp`
  (`kLabelSystemPrompt`), with their grammars.

## How output was reviewed

- Generated code was compiled with `-Wall -Wextra -Wpedantic` under GCC and Clang
  and run under AddressSanitizer and UndefinedBehaviorSanitizer.
- Tests were written against the RFC's numbers, not against the implementation's
  output, so a wrong formula fails.
- The evaluation's golden snapshots are derived from `eval/defects.json`, not from
  the auditor, and CI fails if they drift.
- A human review of the native HarmonyOS code on a device is still required
  (spikes S1, S2, S4).

## Failed approaches and corrections

| What happened | Fix |
| --- | --- |
| The first push failed with HTTP 403: the Claude GitHub App had no write access to the repository. | Work continued in local commits; the repository owner grants access. |
| A planner test built a candidate named "…tap Delete…" and crashed the test harness: destructive-control gating had (correctly) removed it. | Test fixed; the crash came from the test indexing an empty list. |
| `audit` from the CLI on a raw snapshot missed R1 because names were not derived yet. | Every core entry point now calls the idempotent `finalize()`. |
| The guide overlay would have appeared in its own snapshots, so the model could pick the "Stop" button. | `finalize()` drops subtrees under `nativeID="waypoint-overlay"`. |
| A toggled switch left `rev` unchanged, so the guide could not see the step happen. | `checked` and `selected` enter the hash (documented deviation). |
| The lexical baseline scored B above C because "Ticket" (fallback label) matched and "Tickets" did not. | Plural-stripping in the baseline only; the core's scoring follows the RFC. |
| RFC R6 double-counted icon buttons (R1 on the button, R6 on its image). | R6 skips images inside an accessible element (documented deviation). |
| `npm install` failed: RNOH 0.77.75 peers on React Native 0.77.1 exactly. | Pinned 0.77.1 everywhere. |
| `cpp/build-release/` was committed because `.gitignore` covered only `cpp/build/`. | History rewritten before the first push; `cpp/build*/` ignored. |
| ctest ran one of two suites: `enable_testing()` came after the `llm` subdirectory. | Moved earlier. |
| No model could be downloaded in the build environment (Hugging Face blocked). | Harness ships with a non-LLM baseline for CI; model results are a scripted step. |

## Limitations of this workflow

- Native HarmonyOS code was written against headers and templates without a
  device; the RNOH header check catches API mismatches in the C++ modules, not
  runtime behaviour.
- The guide's success with a real model is unmeasured until `eval` runs against
  `llama-server`.
- AI-written tests can share the AI's misunderstanding of a requirement; the tests
  tied to RFC numbers and the seeded-defect list are the guard against that.
