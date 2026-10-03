// WaypointLlm: cxxTurboModule for on-device inference (RFC-001 §10, §11).
// Spec: packages/waypoint-sdk/src/specs/NativeWaypointLlm.ts
//
// Model calls never run on the JS thread: every load/complete is queued on one
// worker thread, and the promise resolves through the JS call invoker.
#pragma once

#include <condition_variable>
#include <deque>
#include <functional>
#include <mutex>
#include <thread>

#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>

#include "waypoint/llm/local_backend.hpp"

namespace waypoint::rnoh {

class LlmWorker {
 public:
  LlmWorker();
  ~LlmWorker();
  void post(std::function<void()> job);

 private:
  void run();
  std::mutex mu_;
  std::condition_variable cv_;
  std::deque<std::function<void()>> jobs_;
  bool stop_ = false;
  std::thread thread_;
};

class WaypointLlmTurboModule : public facebook::react::TurboModule {
 public:
  static constexpr const char* kName = "WaypointLlm";

  explicit WaypointLlmTurboModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker);

 private:
  facebook::jsi::Value load(facebook::jsi::Runtime& rt, const facebook::jsi::Value* args, size_t count);
  facebook::jsi::Value complete(facebook::jsi::Runtime& rt, const facebook::jsi::Value* args, size_t count);

  std::shared_ptr<llm::LocalBackend> backend_ = std::make_shared<llm::LocalBackend>();
  std::shared_ptr<LlmWorker> worker_ = std::make_shared<LlmWorker>();
};

}  // namespace waypoint::rnoh
