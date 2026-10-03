#include "waypoint/api.hpp"

#include <exception>

#include "waypoint/announce.hpp"
#include "waypoint/color.hpp"
#include "waypoint/raw_tree.hpp"
#include "waypoint/walker.hpp"
#include "waypoint/finalize.hpp"
#include "waypoint/json.hpp"
#include "waypoint/labels.hpp"
#include "waypoint/model.hpp"
#include "waypoint/planner.hpp"
#include "waypoint/rules.hpp"

namespace waypoint::api {

namespace {

std::string errorJson(const std::string& what) {
  Json j = Json::object();
  j.set("error", what);
  return j.dump();
}

template <class F>
std::string guarded(F&& f) {
  try {
    return f();
  } catch (const std::exception& e) {
    return errorJson(e.what());
  } catch (...) {
    return errorJson("unknown error");
  }
}

// Every entry point finalizes its input: finalize() is idempotent, so a raw
// snapshot (plan B registry, a file pulled from a device) gets the same
// semantics as one that came from snapshot().
Snapshot load(const std::string& snapshotJson) {
  Snapshot s = snapshotFromJson(Json::parse(snapshotJson));
  waypoint::finalize(s);
  return s;
}

}  // namespace

std::string finalize(const std::string& rawSnapshotJson) {
  return guarded([&] {
    return toJson(load(rawSnapshotJson)).dump();
  });
}

std::string audit(const std::string& snapshotJson) {
  return guarded([&] { return toJson(waypoint::audit(load(snapshotJson))).dump(); });
}

std::string planStep(const std::string& goal, const std::string& snapshotJson, const std::string& historyJson) {
  return guarded([&] {
    Snapshot s = load(snapshotJson);
    PlanContext ctx = historyJson.empty() ? PlanContext{} : planContextFromJson(Json::parse(historyJson));
    return toJson(waypoint::planStep(goal, s, ctx)).dump();
  });
}

std::string parseAction(const std::string& text, const std::string& candidatesJson) {
  return guarded([&] {
    auto candidates = candidatesFromJson(Json::parse(candidatesJson));
    ParseResult r = waypoint::parseAction(text, candidates);
    if (!r.action) return errorJson(r.error);
    return toJson(*r.action).dump();
  });
}

std::string labelRequest(const std::string& snapshotJson, int64_t nodeId) {
  return guarded([&] {
    LabelRequest r = waypoint::labelRequest(load(snapshotJson), nodeId);
    Json j = Json::object();
    j.set("system", r.system);
    j.set("prompt", r.prompt);
    j.set("grammar", r.grammar);
    j.set("fallback", r.fallback);
    return j.dump();
  });
}

std::string validateLabel(const std::string& snapshotJson, int64_t nodeId, const std::string& label) {
  return guarded([&] {
    LabelValidation v = waypoint::validateLabel(load(snapshotJson), nodeId, label);
    Json j = Json::object();
    j.set("ok", v.ok);
    if (!v.ok) j.set("reason", v.reason);
    j.set("label", label);
    j.set("patch", labelPatch(label));
    return j.dump();
  });
}

std::string announce(const std::string& snapshotJson) {
  return guarded([&] {
    Json items = Json::array();
    for (const auto& a : screenReaderOrder(load(snapshotJson))) items.push(toJson(a));
    Json j = Json::object();
    j.set("items", items);
    return j.dump();
  });
}

std::string parseLabelReply(const std::string& text) {
  return guarded([&] {
    auto label = waypoint::parseLabelReply(text);
    if (!label) return errorJson("reply is not {\"label\":\"...\"}");
    Json j = Json::object();
    j.set("label", *label);
    return j.dump();
  });
}

std::string dispatch(const std::string& cmd, const std::string& requestJson) {
  return guarded([&]() -> std::string {
    const Json req = Json::parse(requestJson);
    const std::string snapshot = req["snapshot"].dump();
    if (cmd == "finalize") return finalize(snapshot);
    if (cmd == "audit") return audit(snapshot);
    if (cmd == "plan") {
      const Json* h = req.get("history");
      return planStep(req.str("goal"), snapshot, h ? h->dump() : "");
    }
    if (cmd == "parse") return parseAction(req.str("text"), req["candidates"].dump());
    if (cmd == "label-request") return labelRequest(snapshot, static_cast<int64_t>(req.num("nodeId")));
    if (cmd == "validate-label") return validateLabel(snapshot, static_cast<int64_t>(req.num("nodeId")), req.str("label"));
    if (cmd == "parse-label") return parseLabelReply(req.str("text"));
    if (cmd == "announce") return announce(snapshot);
    if (cmd == "walk") {
      const Json* root = req.get("root");
      if (!root) return errorJson("missing root");
      Rect viewport{0, 0, 360, 780};
      if (const Json* v = req.get("viewport")) viewport = rectFromJson(*v);
      Snapshot s = walkTree(RawAdapter{}, rawNodeFromJson(*root), viewport, static_cast<int64_t>(req.num("surfaceId", 1)));
      waypoint::finalize(s);
      return toJson(s).dump();
    }
    if (cmd == "contrast") {
      auto fg = parseHexColor(req.str("fg")), bg = parseHexColor(req.str("bg"));
      if (!fg || !bg) return errorJson("fg and bg must be hex colours");
      Json out = Json::object();
      out.set("ratio", contrastRatio(compositeOver(*fg, *bg), *bg));
      return out.dump();
    }
    return errorJson("unknown command: " + cmd);
  });
}

}  // namespace waypoint::api
