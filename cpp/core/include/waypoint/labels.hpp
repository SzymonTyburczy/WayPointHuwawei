// Label suggestions (RFC §8): bounded context, prompt, grammar, validation and
// the no-model fallback.
#pragma once

#include <optional>
#include <string>
#include <vector>

#include "waypoint/model.hpp"

namespace waypoint {

extern const char* const kLabelSystemPrompt;
extern const char* const kLabelGrammar;

struct LabelContext {
  std::string component;
  std::string role;
  std::string image;     // basename of imageSrc (own or first descendant)
  std::string testID;
  std::string nativeID;
  std::vector<std::string> before;  // up to three named reading units before the node
  std::vector<std::string> after;   // up to three after it
  std::string ancestor;  // nearest named ancestor
  std::string screen;    // screen title
};

struct LabelRequest {
  std::string system;
  std::string prompt;
  std::string grammar;
  std::string fallback;  // humanised image basename, may be empty
};

struct LabelValidation {
  bool ok = false;
  std::string reason;    // "generic", "duplicate", "file-name-echo", "empty", "too-long"
};

LabelContext buildLabelContext(const Snapshot& snap, int64_t nodeId);
std::string formatLabelPrompt(const LabelContext& ctx);
// Throws std::out_of_range when the node does not exist.
LabelRequest labelRequest(const Snapshot& snap, int64_t nodeId);
LabelValidation validateLabel(const Snapshot& snap, int64_t nodeId, const std::string& label);
// Extracts the label from a {"label":"..."} reply.
std::optional<std::string> parseLabelReply(const std::string& text);
// accessibilityLabel="Settings"
std::string labelPatch(const std::string& label);

}  // namespace waypoint
