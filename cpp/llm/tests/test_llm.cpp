#include <cstdio>
#include <string>

#include "test.hpp"
#include "waypoint/labels.hpp"
#include "waypoint/llm/local_backend.hpp"
#include "waypoint/llm/sha256.hpp"
#include "waypoint/planner.hpp"

void writeTinyModel(const std::string& vocabPath, const std::string& outPath);

using namespace waypoint;
using namespace waypoint::llm;

namespace {

const std::string kModel = "waypoint_tiny_random.gguf";

LocalBackend& backend() {
  static LocalBackend b;
  static bool ready = [] {
    writeTinyModel(WAYPOINT_VOCAB_GGUF, kModel);
    std::string err;
    LoadOptions o;
    o.path = kModel;
    o.nCtx = 1024;
    o.nThreads = 2;
    if (!b.load(o, &err)) throw std::runtime_error(err);
    return true;
  }();
  (void)ready;
  return b;
}

std::vector<Candidate> candidates(int n) {
  std::vector<Candidate> c;
  for (int i = 0; i < n; ++i) {
    Candidate x;
    x.index = i;
    x.id = 100 + i;
    x.name = "Item " + std::to_string(i);
    c.push_back(x);
  }
  return c;
}

}  // namespace

TEST(missing_model_fails_cleanly) {
  LocalBackend b;
  std::string err;
  LoadOptions o;
  o.path = "/nonexistent/model.gguf";
  EXPECT_FALSE(b.load(o, &err));
  EXPECT_TRUE(err.find("not found") != std::string::npos);
  EXPECT_FALSE(b.loaded());
  EXPECT_THROWS(b.complete("s", "p", "", 4));
}

TEST(checksum_mismatch_refuses_to_load) {
  backend();  // makes sure the file exists
  LocalBackend b;
  std::string err;
  LoadOptions o;
  o.path = kModel;
  o.sha256 = std::string(64, '0');
  EXPECT_FALSE(b.load(o, &err));
  EXPECT_TRUE(err.find("checksum") != std::string::npos);
  o.sha256 = sha256File(kModel);
  EXPECT_TRUE(b.load(o, &err));
}

TEST(grammar_constrains_random_weights_to_a_valid_action) {
  auto& b = backend();
  for (int n : {1, 3, 6, 24}) {
    std::string grammar = buildActionGrammar(static_cast<size_t>(n), false, true, true);
    Completion c = b.complete(kGuideSystemPrompt, "GOAL: make the text bigger\nSCREEN: Home\n", grammar, 32);
    ParseResult r = parseAction(c.text, candidates(n));
    if (!r.action) throw wptest::Failure{"not a valid action: '" + c.text + "' (" + r.error + ")"};
    EXPECT_TRUE(c.genTokens > 0);
  }
}

TEST(grammar_constrains_label_replies) {
  Completion c = backend().complete(kLabelSystemPrompt, "screen: Profile\ncontrol: View role=button image=ic_gear\n",
                                    kLabelGrammar, 48);
  auto label = parseLabelReply(c.text);
  if (!label) throw wptest::Failure{"not a label reply: '" + c.text + "'"};
  EXPECT_TRUE(!label->empty());
}

TEST(static_prefix_is_reused_from_the_kv_cache) {
  auto& b = backend();
  std::string grammar = buildActionGrammar(4, false, false, true);
  b.complete(kGuideSystemPrompt, "GOAL: a\nSCREEN: One\n", grammar, 16);
  Completion second = b.complete(kGuideSystemPrompt, "GOAL: b\nSCREEN: Two\n", grammar, 16);
  EXPECT_TRUE(second.cachedTokens > 50);
  EXPECT_TRUE(second.promptTokens < second.cachedTokens);
}

TEST(bad_grammar_and_oversized_prompt_throw) {
  auto& b = backend();
  EXPECT_THROWS(b.complete("s", "p", "root ::= (", 4));
  EXPECT_THROWS(b.complete("s", std::string(20000, 'x'), "", 4));
  // The backend still works afterwards.
  Completion c = b.complete("s", "p", "root ::= \"ok\"", 4);
  EXPECT_EQ(c.text, std::string("ok"));
}

int main() {
  int rc = wptest::runAll();
  std::remove(kModel.c_str());
  return rc;
}
