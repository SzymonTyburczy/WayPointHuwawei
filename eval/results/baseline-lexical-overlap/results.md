# Waypoint evaluation results

Generated 2026-10-03T19:39:00.836Z by `eval/src/cli.ts`. Raw logs sit next to this file.

| Setting | Value |
| --- | --- |
| Backend | baseline (lexical-overlap) |
| Temperature / seed | 0 / 0 |
| Step limit | 8 |
| App | simulated demo app (`eval/src/simulator.ts`), host |
| Commit | 6983f07 |

> **This run uses the lexical baseline, not a language model.** It shows that the harness works and gives a
> floor. Numbers about Waypoint's guide come from a run against `llama-server` (see eval/README.md).

## M1 — Guide success rate

| Condition | Success | 
| --- | --- |
| A — defective | 0/30 (0%; 95% CI 0%–11%) |
| B — auto-fixed (accepted suggestions) | 5/30 (17%; 95% CI 7%–34%) |
| C — hand-fixed | 5/30 (17%; 95% CI 7%–34%) |

Per task (successes out of phrasings):

| Task | A | B | C |
| --- | --- | --- | --- |
| 1 | 0/3 | 0/3 | 0/3 |
| 2 | 0/3 | 0/3 | 0/3 |
| 3 | 0/3 | 0/3 | 0/3 |
| 4 | 0/3 | 2/3 | 2/3 |
| 5 | 0/3 | 3/3 | 3/3 |
| 6 | 0/3 | 0/3 | 0/3 |
| 7 | 0/3 | 0/3 | 0/3 |
| 8 | 0/3 | 0/3 | 0/3 |
| 9 | 0/3 | 0/3 | 0/3 |
| 10 | 0/3 | 0/3 | 0/3 |

Failure reasons: A:ask ×30, B:ask ×24, B:timeout ×1, C:ask ×24, C:timeout ×1

## M4 — Step latency

Not meaningful for the baseline (no model).

## M2 — Audit recall and precision

| Rule | Seeded | TP | FP | FN | Recall | Precision |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | 8 | 8 | 0 | 0 | 8/8 | 8/8 |
| R2 | 4 | 4 | 0 | 0 | 4/4 | 4/4 |
| R3 | 4 | 4 | 0 | 0 | 4/4 | 4/4 |
| R4 | 2 | 2 | 0 | 0 | 2/2 | 2/2 |
| R5 | 1 | 1 | 0 | 0 | 1/1 | 1/1 |
| R6 | 1 | 1 | 0 | 0 | 1/1 | 1/1 |
| **All** | 20 | 20 | 0 | 0 | 20/20 | 20/20 |

Text over images, contrast not computed: 0.

## M3 — Label acceptance

5/8 R1 defects received a suggestion from the accepted list (0 from the model, 7 low-confidence fallbacks, 1 without a suggestion).

| testID | Suggestion | Source | Accepted |
| --- | --- | --- | --- |
| tab-home | Home | low | yes |
| tab-tickets | Ticket | low | yes |
| tab-profile | Person | low | no |
| tab-settings | Gear | low | no |
| home-search | Search | low | yes |
| profile-help | Help | low | yes |
| profile-edit | Edit | low | yes |
| edit-phone | — | — | no |

Model calls: 21; rejected by the validator: generic ×21.

## Threats to validity

- We wrote the app, the tasks and the phrasings, so the set is biased toward what works.
- Thirty trials per condition is small; the intervals are wide.
- The host simulator mirrors the demo app's layout and props but is not the emulator; device runs are authoritative.
