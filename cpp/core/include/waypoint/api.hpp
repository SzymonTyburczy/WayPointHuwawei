// String-in, string-out facade over the core. These functions back the
// cxxTurboModule (harmony/waypoint) and the host CLI, so both expose exactly the
// same behaviour. They never throw: failures come back as {"error": "..."}.
#pragma once

#include <cstdint>
#include <string>

namespace waypoint::api {

// Raw snapshot (from the walker or the JS registry) -> finalized snapshot.
std::string finalize(const std::string& rawSnapshotJson);
// Finalized snapshot -> {findings, counts, contrastUnknown, partial, nodeCount}.
std::string audit(const std::string& snapshotJson);
// -> {system, prompt, grammar, candidates, allowed, title, stop?}
std::string planStep(const std::string& goal, const std::string& snapshotJson, const std::string& historyJson);
// -> Action JSON ({a, id, index} | {a, dir} | {a}) or {error}
std::string parseAction(const std::string& text, const std::string& candidatesJson);
// -> {system, prompt, grammar, fallback}
std::string labelRequest(const std::string& snapshotJson, int64_t nodeId);
// -> {ok, reason?, label, patch}
std::string validateLabel(const std::string& snapshotJson, int64_t nodeId, const std::string& label);
// -> {items: [{id, text, name, role?, states?, unnamed?, frame}]} in screen-reader order
std::string announce(const std::string& snapshotJson);
// {"label":"..."} reply -> {label} or {error}
std::string parseLabelReply(const std::string& text);

// One entry point for every command, taking the request as one JSON object. Used
// by waypoint-cli and the WebAssembly build. Commands and their request fields:
//   finalize {snapshot} · audit {snapshot} · plan {goal, snapshot, history?}
//   parse {text, candidates} · label-request {snapshot, nodeId}
//   validate-label {snapshot, nodeId, label} · parse-label {text} · announce {snapshot}
//   walk {root, viewport?, surfaceId?} · contrast {fg, bg}
// Unknown commands and bad requests return {"error": ...}.
std::string dispatch(const std::string& cmd, const std::string& requestJson);

}  // namespace waypoint::api
