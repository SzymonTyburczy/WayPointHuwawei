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
//   announce        {snapshot}                        screen-reader order and speech
//   contrast        {fg, bg}                          hex colours
//
// Output is one JSON document on stdout. Exit code 1 when it is {"error": ...}.
#include <cstdio>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

#include "waypoint/api.hpp"
#include "waypoint/json.hpp"

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
  std::cerr << "usage: waypoint-cli <finalize|walk|audit|plan|parse|label-request|validate-label|parse-label|announce|contrast>"
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

  const std::string out = api::dispatch(cmd, req.dump());
  if (out.rfind("{\"error\":\"unknown command", 0) == 0) return usage();
  return emit(out);
}
