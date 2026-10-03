# AI features

Waypoint uses a language model for two narrow jobs. Everything else (finding
defects, deciding what is on screen, checking replies, drawing the highlight) is
deterministic code.

| Feature | Model's job | What the model cannot do |
| --- | --- | --- |
| Label suggestions (RFC §8) | Propose a 1–4 word `accessibilityLabel` for an unnamed control | Decide whether something is a defect; produce anything but `{"label":"…"}` |
| Guide (RFC §9) | Pick the next element from a numbered list, or scroll/back/done/ask | Point at an element that is not on screen; type text; open URLs; tap |

## Model

Chosen by measurement: run `eval` against each candidate on `llama-server` and keep
the smallest model with the best SR(B) (`eval/README.md`). Candidates from the RFC:
MiniCPM 1B (known to run on HarmonyOS through llama.cpp), Qwen3 0.6B/1.7B,
Gemma 3 1B, LFM2.5-1.2B, all as GGUF Q4_K_M. The chosen file, quantisation and
SHA-256 go into the README's version table. The repository contains no model.

## Inference flow

```text
snapshot (C++) ──► planStep (C++): candidates, prompt, per-step GBNF
                       │
                       ▼
         LlmBackend.complete(system, prompt, grammar, maxTokens=24)
           ├─ local:  llama.cpp, grammar sampler → greedy, KV prefix reuse, worker thread
           └─ remote: llama-server over the hdc port forward, same grammar, temperature 0
                       │
                       ▼
         parseAction (C++): strict JSON, known action, id in range → React tag
                       │
                       ▼
         GuideOverlay: ring + template caption; the user taps
```

Label suggestions follow the same path with `labelRequest` / `validateLabel`.

**Prompt sizes.** The guide's static system prompt is ~150 tokens and is reused
from the KV cache; each step adds ~12 tokens per candidate (≤ 24) plus history,
about 350 tokens in total. Label prompts stay under ~150 tokens.

**Latency budget.** T ≈ P/v_p + G/v_g (RFC §9). Measured values replace the RFC's
assumptions after spike S3; `eval` reports median and p90 per backend (M4).

**Memory.** Model file + KV cache (2 · n_layers · n_ctx · d_kv · b) + working
memory; n_ctx = 2048, 4 threads. A device with at least 4 GB RAM is recommended
for a 1B model at Q4_K_M.

## Data handling and privacy

- **Local mode:** the snapshot, prompts and replies never leave the device.
- **Remote mode:** they travel over the `hdc rport` forward to the developer's
  laptop. Release builds refuse non-loopback URLs unless the integrator sets
  `allowNonLoopback`.
- **Never collected:** TextInput values (the walker does not read them; secure
  fields stay empty), anything outside the app's own UI tree.
- **Logging:** off by default. When enabled (`log` prop), one JSON line per call,
  kept in memory or written where the integrator chooses. The evaluation logs
  come from the demo app, which holds synthetic data only.
- **No keys or accounts:** nothing in the project calls a cloud API.

## Validation and safety

- **Closed output space.** Each guide step gets a grammar with one alternative per
  on-screen index plus `scroll` (only if content is clipped), `back` (only if
  possible), `done` and `ask`. The label grammar admits one JSON object with one to
  four words. `cpp/llm/tests/test_llm.cpp` runs a model with random weights and
  shows the grammar alone yields parseable output.
- **Defence in depth.** The C++ parser re-validates every reply, because a
  remote server may ignore the grammar.
- **Screen text is untrusted.** Names are stripped of control characters and quotes
  and cut to 60 characters; the system prompt states that names are data; captions
  are templates.
- **Destructive controls** (delete, pay, send, log out, …) are offered to the model
  only when the goal shares a word with them.
- **The guide never taps.** A wrong choice is a wrong hint the user can ignore.
- **Label validation.** Generic labels, labels that would create a duplicate name,
  and file-name echoes are discarded; the finding is then shown without a
  suggestion or with the low-confidence fallback.

## Limitations

- English only; one model; small task set written by the authors (see the threats
  to validity in `eval/results/*/results.md`).
- Actionability is a heuristic; press handlers are not visible in native props.
- Transforms are ignored; occlusion is approximated by modals only; text drawn by
  third-party native components is invisible to the walker.
- Contrast over images or gradients is reported as "unknown", not computed.
- R2 ignores the WCAG 2.5.8 spacing exception and can over-report.
- WCAG thresholds were written from memory in the RFC and must be checked against
  WCAG 2.2 before they are quoted.
