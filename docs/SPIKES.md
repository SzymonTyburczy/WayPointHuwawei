# Go/no-go spikes (RFC-001 §14)

Run all four in the first two hours on the target the jury will use. Record the
outcome in the log at the bottom. A failed spike switches to its fallback at once.

## S1 — RNOH with a C++ TurboModule at API 20 (60 min)

1. `cd examples/demo-app && npm ci && npm run bundle:harmony`
2. Open `examples/demo-app/harmony` in DevEco Studio, let it sync, sign, run `entry`
   on the emulator (x86_64) or a device (arm64-v8a).
3. In the app, open the audit (A11y). Pass: the panel lists findings, so
   `WaypointCore.audit` ran in C++.

Record: DevEco version, SDK version, emulator image or device and OS build.
**Fallback:** a mentor's device; if RNOH is unusable, re-plan on native ArkTS with
FrameNode.

## S2 — Reading the shadow tree in RNOH (60 min)

1. Before the device: `harmony/tools/check_rnoh_headers.sh` compiles the adapter
   against RNOH's bundled React Native headers.
2. On the device, in a debug build, log one snapshot:
   `console.log(JSON.stringify(Waypoint.runtime()?.snapshot()))` from a button, or
   read `report.nodeCount` in the audit panel.
3. Pass: Home has ~30 nodes with frames, `component`, the tabs' `testID`s, and the
   greeting's text and colour.
4. Save each screen's snapshot to `eval/results/device/snapshots/<screen>.json` and
   compare with `npm run golden`'s simulator output (frames within a few vp).

Things to check against the fork: `UIManagerBinding::getBinding`,
`ShadowTreeRegistry::visit`, `getContentOriginOffset` on ScrollView, the paragraph
state's `attributedString`, `ImageProps::sources[0].uri`, colour components.
**Fallback:** partial → get colours from the registry; none → plan B
(`snapshotSource="registry"`, already wired in the demo app).

## S3 — llama-server with a grammar (30 min)

1. On the laptop: `llama-server -m <model>.gguf --port 8080 --temp 0 --seed 0`
2. `hdc rport tcp:8080 tcp:8080`
3. In the app, press Guide and ask "make the text bigger". Pass: a highlight within
   2 s; record P, G and the time per step from the log.

Check whether cleartext HTTP to loopback is allowed by default (it is required for
the remote backend). **Fallback:** the emulator's host address; else bring the
local backend forward.

## S4 — The screen reader announces React Native labels (30 min)

1. Enable the screen reader on the target.
2. Build with `CONDITION = 'C'` in `src/config.ts`; swipe through Settings and the
   tab bar.
3. Pass: "Settings, tab, selected" (or the platform's wording) is announced. Fill
   the first rows of [CONFORMANCE.md](CONFORMANCE.md).

**Fallback:** a mentor's device; else rely on declared props only.

## Log

| Spike | Date | Target | Result | Notes |
| --- | --- | --- | --- | --- |
| S1 | | | | |
| S2 | | | | |
| S3 | | | | |
| S4 | | | | |
