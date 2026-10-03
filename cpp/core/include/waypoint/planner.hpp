// Guide planner (RFC §9): candidate selection, prompt, per-step grammar, and the
// strict action parser that is the last line of defence against bad replies.
#pragma once

#include <optional>
#include <string>
#include <vector>

#include "waypoint/json.hpp"
#include "waypoint/model.hpp"

namespace waypoint {

struct Candidate {
  int index = 0;
  int64_t id = 0;
  std::string role;   // display role: a11y role, or textbox/switch/button
  std::string name;   // sanitised
  bool selected = false;
  std::string checked;
  bool tab = false;
  bool back = false;
  double score = 0;
};

struct HistoryEntry {
  std::string a;      // tap, scroll, back
  std::string name;   // tap target name
  std::string dir;    // scroll direction
};

struct PlanContext {
  std::vector<HistoryEntry> history;
  bool canGoBack = true;
};

struct PlanOptions {
  size_t maxCandidates = 24;  // K
  size_t historySteps = 4;
  size_t maxNameLen = 60;
};

struct Plan {
  std::string system;   // static, byte-identical across steps (KV-cache prefix)
  std::string prompt;
  std::string grammar;  // GBNF
  std::vector<Candidate> candidates;
  bool scrollUp = false, scrollDown = false, back = false;
  std::string title;
  std::string stop;     // non-empty when there is nothing to plan ("no-candidates")
};

extern const char* const kGuideSystemPrompt;

// Largest visible text in the top 120 vp of the viewport.
std::string screenTitle(const Snapshot& snap);
bool isDestructiveName(const std::string& name);
std::vector<Candidate> selectCandidates(const std::string& goal, const Snapshot& snap,
                                        const PlanOptions& opts = {});
// Whether any visible ScrollView has content clipped above / below it.
void scrollAvailability(const Snapshot& snap, bool& up, bool& down);
std::string buildActionGrammar(size_t candidateCount, bool scrollUp, bool scrollDown, bool back);
Plan planStep(const std::string& goal, const Snapshot& snap, const PlanContext& ctx, const PlanOptions& opts = {});

struct ParseResult {
  std::optional<Action> action;
  std::string error;
};
// Strict parser: one JSON object, known action, in-range integer id, valid dir.
// Maps the candidate index to its React tag.
ParseResult parseAction(const std::string& text, const std::vector<Candidate>& candidates);

PlanContext planContextFromJson(const Json& j);
Json toJson(const Plan& plan);
Json toJson(const Candidate& c);
std::vector<Candidate> candidatesFromJson(const Json& j);

}  // namespace waypoint
