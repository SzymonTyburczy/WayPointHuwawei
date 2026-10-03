// Screen-reader simulation: the elements a screen reader stops on, in swipe order,
// and what it says for each. Developers hear their screen the way a blind user
// does; the same list drives focus-order rule R8 and the spoken "read everything".
#pragma once

#include <string>
#include <vector>

#include "waypoint/model.hpp"

namespace waypoint {

struct Announcement {
  int64_t id = 0;
  std::string name;      // accessible name, may be empty
  std::string role;      // spoken role word: "button", "tab", "heading", ...
  std::string states;    // "selected", "on", "disabled", ... comma-separated
  std::string text;      // the full utterance, e.g. "Settings, tab, selected"
  bool unnamed = false;  // an interactive element with nothing to say but its role
  Rect frame;
};

// Focus stops: visible, not hidden, not grouped into an accessible ancestor, and
// accessible, a text, a text input or a switch.
std::vector<Announcement> screenReaderOrder(const Snapshot& snap);

Json toJson(const Announcement& a);

}  // namespace waypoint
