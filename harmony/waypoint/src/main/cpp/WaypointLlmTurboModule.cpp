#include "WaypointLlmTurboModule.h"

#include <ReactCommon/TurboModuleUtils.h>

#include "waypoint/json.hpp"

namespace jsi = facebook::jsi;
using facebook::react::Promise;
using facebook::react::TurboModule;

namespace waypoint::rnoh {

LlmWorker::LlmWorker() : thread_([this] { run(); }) {}

LlmWorker::~LlmWorker() {
  {
    std::lock_guard<std::mutex> lock(mu_);
    stop_ = true;
  }
  cv_.notify_all();
  if (thread_.joinable()) thread_.join();
}

void LlmWorker::post(std::function<void()> job) {
  {
    std::lock_guard<std::mutex> lock(mu_);
    jobs_.push_back(std::move(job));
  }
  cv_.notify_one();
}

void LlmWorker::run() {
  while (true) {
    std::function<void()> job;
    {
      std::unique_lock<std::mutex> lock(mu_);
      cv_.wait(lock, [this] { return stop_ || !jobs_.empty(); });
      if (stop_ && jobs_.empty()) return;
      job = std::move(jobs_.front());
      jobs_.pop_front();
    }
    job();
  }
}

namespace {

std::string arg(jsi::Runtime& rt, const jsi::Value* args, size_t count, size_t i) {
  if (i >= count || !args[i].isString()) return "";
  return args[i].getString(rt).utf8(rt);
}

double num(const jsi::Value* args, size_t count, size_t i, double def) {
  return i < count && args[i].isNumber() ? args[i].getNumber() : def;
}

}  // namespace

WaypointLlmTurboModule::WaypointLlmTurboModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker)
    : TurboModule(kName, std::move(jsInvoker)) {
  methodMap_["load"] = MethodMetadata{4, [](jsi::Runtime& rt, TurboModule& self, const jsi::Value* a, size_t n) {
    return static_cast<WaypointLlmTurboModule&>(self).load(rt, a, n);
  }};
  methodMap_["complete"] = MethodMetadata{4, [](jsi::Runtime& rt, TurboModule& self, const jsi::Value* a, size_t n) {
    return static_cast<WaypointLlmTurboModule&>(self).complete(rt, a, n);
  }};
  methodMap_["info"] = MethodMetadata{0, [](jsi::Runtime& rt, TurboModule& self, const jsi::Value*, size_t) {
    auto& m = static_cast<WaypointLlmTurboModule&>(self);
    Json j = Json::object();
    if (m.backend_->loaded()) {
      j.set("model", m.backend_->modelName());
      j.set("nCtx", m.backend_->nCtx());
    }
    return jsi::Value(jsi::String::createFromUtf8(rt, j.dump()));
  }};
  methodMap_["unload"] = MethodMetadata{0, [](jsi::Runtime&, TurboModule& self, const jsi::Value*, size_t) {
    auto& m = static_cast<WaypointLlmTurboModule&>(self);
    auto backend = m.backend_;
    m.worker_->post([backend] { backend->unload(); });
    return jsi::Value::undefined();
  }};
}

jsi::Value WaypointLlmTurboModule::load(jsi::Runtime& rt, const jsi::Value* args, size_t count) {
  llm::LoadOptions opts;
  opts.path = arg(rt, args, count, 0);
  opts.nCtx = static_cast<int>(num(args, count, 1, 2048));
  opts.nThreads = static_cast<int>(num(args, count, 2, 4));
  opts.sha256 = arg(rt, args, count, 3);
  auto backend = backend_;
  auto worker = worker_;
  auto invoker = jsInvoker_;
  return facebook::react::createPromiseAsJSIValue(rt, [=](jsi::Runtime&, std::shared_ptr<Promise> promise) {
    worker->post([=] {
      std::string error;
      bool ok = backend->load(opts, &error);
      invoker->invokeAsync([promise, ok](jsi::Runtime&) { promise->resolve(jsi::Value(ok)); });
    });
  });
}

jsi::Value WaypointLlmTurboModule::complete(jsi::Runtime& rt, const jsi::Value* args, size_t count) {
  std::string system = arg(rt, args, count, 0);
  std::string prompt = arg(rt, args, count, 1);
  std::string grammar = arg(rt, args, count, 2);
  int maxTokens = static_cast<int>(num(args, count, 3, 24));
  auto backend = backend_;
  auto worker = worker_;
  auto invoker = jsInvoker_;
  return facebook::react::createPromiseAsJSIValue(rt, [=](jsi::Runtime&, std::shared_ptr<Promise> promise) {
    worker->post([=] {
      try {
        llm::Completion c = backend->complete(system, prompt, grammar, maxTokens);
        Json j = Json::object();
        j.set("text", c.text);
        j.set("promptTokens", c.promptTokens);
        j.set("cachedTokens", c.cachedTokens);
        j.set("genTokens", c.genTokens);
        j.set("ms", c.ms);
        std::string out = j.dump();
        invoker->invokeAsync([promise, out](jsi::Runtime& jsRt) {
          promise->resolve(jsi::String::createFromUtf8(jsRt, out));
        });
      } catch (const std::exception& e) {
        std::string why = e.what();
        invoker->invokeAsync([promise, why](jsi::Runtime&) { promise->reject(why); });
      }
    });
  });
}

}  // namespace waypoint::rnoh
