// waypoint-cli: host access to the core, used by the evaluation harness and for
// debugging snapshots pulled from a device.
//
// Usage:
//   waypoint-cli <command> [snapshot.json]          human use: snapshot from a file
//   waypoint-cli <command> < request.json            machine use: one JSON object on stdin
//
// Request fields by command (stdin form):
//   finalize        {snapshot}
//   walk            {root, viewport?, surfaceId?}    nested raw tree, see raw_tree.hpp
//   audit           {snapshot}
//   plan            {goal, snapshot, history?}
//   parse           {text, candidates}
//   label-request   {snapshot, nodeId}
//   validate-label  {snapshot, nodeId, label}
//   parse-label     {text}
//   contrast        {fg, bg}                          hex colours
//
// Output is one JSON document on stdout. Exit code 1 when it is {"error": ...}.
#include <cstdio>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

#include "waypoint/api.hpp"
#include "waypoint/color.hpp"
#include "waypoint/finalize.hpp"
#include "waypoint/json.hpp"
#include "waypoint/model.hpp"
#include "waypoint/raw_tree.hpp"
#include "waypoint/walker.hpp"

using namespace waypoint;

namespace {

std::string readAll(std::istream& in) {
  std::stringstream ss;
  ss << in.rdbuf();
  return ss.str();
}

int emit(const std::string& out) {
  std::cout << out << "\n";
  return out.rfind("{\"error\"", 0) == 0 ? 1 : 0;
}

int usage() {
  std::cerr << "usage: waypoint-cli <finalize|walk|audit|plan|parse|label-request|validate-label|parse-label|contrast>"
               " [snapshot.json] < request.json\n";
  return 2;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) return usage();
  const std::string cmd = argv[1];

  Json req;
  try {
    if (argc >= 3) {
      std::ifstream f(argv[2]);
      if (!f) {
        std::cerr << "cannot open " << argv[2] << "\n";
        return 2;
      }
      req = Json::object();
      req.set(cmd == "walk" ? "root" : "snapshot", Json::parse(readAll(f)));
    } else {
      req = Json::parse(readAll(std::cin));
    }
  } catch (const std::exception& e) {
    Json err = Json::object();
    err.set("error", std::string("bad request: ") + e.what());
    return emit(err.dump());
  }

  const std::string snapshot = req["snapshot"].dump();
  if (cmd == "finalize") return emit(api::finalize(snapshot));
  if (cmd == "audit") return emit(api::audit(snapshot));
  if (cmd == "plan") {
    const Json* h = req.get("history");
    return emit(api::planStep(req.str("goal"), snapshot, h ? h->dump() : ""));
  }
  if (cmd == "parse") return emit(api::parseAction(req.str("text"), req["candidates"].dump()));
  if (cmd == "label-request") return emit(api::labelRequest(snapshot, static_cast<int64_t>(req.num("nodeId"))));
  if (cmd == "validate-label") {
    return emit(api::validateLabel(snapshot, static_cast<int64_t>(req.num("nodeId")), req.str("label")));
  }
  if (cmd == "parse-label") return emit(api::parseLabelReply(req.str("text")));
  if (cmd == "walk") {
    try {
      const Json* root = req.get("root");
      if (!root) throw JsonError("missing root");
      Rect viewport{0, 0, 360, 780};
      if (const Json* v = req.get("viewport")) viewport = rectFromJson(*v);
      Snapshot s = walkTree(RawAdapter{}, rawNodeFromJson(*root), viewport,
                            static_cast<int64_t>(req.num("surfaceId", 1)));
      finalize(s);
      return emit(toJson(s).dump());
    } catch (const std::exception& e) {
      Json err = Json::object();
      err.set("error", e.what());
      return emit(err.dump());
    }
  }
  if (cmd == "contrast") {
    auto fg = parseHexColor(req.str("fg")), bg = parseHexColor(req.str("bg"));
    Json out = Json::object();
    if (!fg || !bg) {
      out.set("error", "fg and bg must be hex colours");
    } else {
      Rgba effFg = compositeOver(*fg, *bg);
      out.set("ratio", contrastRatio(effFg, *bg));
    }
    return emit(out.dump());
  }
  return usage();
}
