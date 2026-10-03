#include "waypoint/llm/local_backend.hpp"

#include <algorithm>
#include <chrono>
#include <fstream>
#include <mutex>

#include "llama.h"
#include "waypoint/llm/sha256.hpp"

namespace waypoint::llm {

namespace {

std::once_flag gBackendInit;

void quietLog(ggml_log_level level, const char* text, void*) {
  if (level == GGML_LOG_LEVEL_ERROR) fputs(text, stderr);
}

std::string basename(const std::string& path) {
  size_t slash = path.find_last_of("/\\");
  return slash == std::string::npos ? path : path.substr(slash + 1);
}

struct SamplerDeleter {
  void operator()(llama_sampler* s) const { llama_sampler_free(s); }
};

}  // namespace

LocalBackend::LocalBackend() {
  std::call_once(gBackendInit, [] {
    llama_log_set(quietLog, nullptr);
    llama_backend_init();
  });
}

LocalBackend::~LocalBackend() { unload(); }

bool LocalBackend::load(const LoadOptions& opts, std::string* error) {
  std::lock_guard<std::mutex> lock(mu_);
  auto fail = [&](const std::string& why) {
    if (error) *error = why;
    return false;
  };
  if (ctx_) llama_free(ctx_), ctx_ = nullptr;
  if (model_) llama_model_free(model_), model_ = nullptr;
  cached_.clear();

  if (!std::ifstream(opts.path).good()) return fail("model file not found: " + opts.path);
  if (!opts.sha256.empty()) {
    std::string actual = sha256File(opts.path);
    if (actual != opts.sha256) return fail("model checksum mismatch: expected " + opts.sha256 + ", got " + actual);
  }

  llama_model_params mp = llama_model_default_params();
  mp.n_gpu_layers = 0;
  model_ = llama_model_load_from_file(opts.path.c_str(), mp);
  if (!model_) return fail("llama.cpp could not load " + opts.path);

  llama_context_params cp = llama_context_default_params();
  cp.n_ctx = static_cast<uint32_t>(opts.nCtx);
  cp.n_batch = static_cast<uint32_t>(std::min(opts.nCtx, 512));
  cp.n_threads = opts.nThreads;
  cp.n_threads_batch = opts.nThreads;
  ctx_ = llama_init_from_model(model_, cp);
  if (!ctx_) {
    llama_model_free(model_);
    model_ = nullptr;
    return fail("not enough memory for a context of " + std::to_string(opts.nCtx) + " tokens");
  }
  name_ = basename(opts.path);
  nCtx_ = opts.nCtx;
  return true;
}

bool LocalBackend::loaded() const {
  std::lock_guard<std::mutex> lock(mu_);
  return ctx_ != nullptr;
}

void LocalBackend::unload() {
  std::lock_guard<std::mutex> lock(mu_);
  if (ctx_) llama_free(ctx_);
  if (model_) llama_model_free(model_);
  ctx_ = nullptr;
  model_ = nullptr;
  cached_.clear();
}

std::string LocalBackend::modelName() const {
  std::lock_guard<std::mutex> lock(mu_);
  return name_;
}

int LocalBackend::nCtx() const {
  std::lock_guard<std::mutex> lock(mu_);
  return nCtx_;
}

std::vector<int> LocalBackend::tokenize(const std::string& text, bool addSpecial) const {
  const llama_vocab* vocab = llama_model_get_vocab(model_);
  int n = -llama_tokenize(vocab, text.data(), static_cast<int32_t>(text.size()), nullptr, 0, addSpecial, true);
  std::vector<llama_token> out(static_cast<size_t>(std::max(n, 0)));
  if (n > 0 && llama_tokenize(vocab, text.data(), static_cast<int32_t>(text.size()), out.data(), n, addSpecial, true) < 0) {
    throw LlmError("tokenization failed");
  }
  return std::vector<int>(out.begin(), out.end());
}

std::string LocalBackend::piece(int token) const {
  const llama_vocab* vocab = llama_model_get_vocab(model_);
  char buf[256];
  int n = llama_token_to_piece(vocab, token, buf, sizeof buf, 0, false);
  if (n >= 0) return std::string(buf, static_cast<size_t>(n));
  std::string big(static_cast<size_t>(-n), '\0');
  n = llama_token_to_piece(vocab, token, big.data(), static_cast<int32_t>(big.size()), 0, false);
  return n >= 0 ? big.substr(0, static_cast<size_t>(n)) : std::string();
}

std::string LocalBackend::formatChat(const std::string& system, const std::string& prompt) const {
  const char* tmpl = model_ ? llama_model_chat_template(model_, nullptr) : nullptr;
  llama_chat_message msgs[2] = {{"system", system.c_str()}, {"user", prompt.c_str()}};
  std::vector<char> buf(2 * (system.size() + prompt.size()) + 256);
  int n = llama_chat_apply_template(tmpl ? tmpl : "chatml", msgs, 2, true, buf.data(), static_cast<int32_t>(buf.size()));
  if (n > static_cast<int>(buf.size())) {
    buf.resize(static_cast<size_t>(n));
    n = llama_chat_apply_template(tmpl ? tmpl : "chatml", msgs, 2, true, buf.data(), static_cast<int32_t>(buf.size()));
  }
  if (n < 0) {
    // Template not supported by llama.cpp's built-in list: fall back to ChatML.
    return "<|im_start|>system\n" + system + "<|im_end|>\n<|im_start|>user\n" + prompt +
           "<|im_end|>\n<|im_start|>assistant\n";
  }
  return std::string(buf.data(), static_cast<size_t>(n));
}

Completion LocalBackend::complete(const std::string& system, const std::string& prompt, const std::string& grammar,
                                  int maxTokens) {
  std::lock_guard<std::mutex> lock(mu_);
  if (!ctx_) throw LlmError("no model loaded");
  const auto started = std::chrono::steady_clock::now();
  const llama_vocab* vocab = llama_model_get_vocab(model_);

  std::vector<int> tokens = tokenize(formatChat(system, prompt), true);
  if (tokens.empty()) throw LlmError("empty prompt");
  if (static_cast<int>(tokens.size()) + maxTokens > nCtx_) {
    throw LlmError("prompt of " + std::to_string(tokens.size()) + " tokens does not fit the context");
  }

  // Reuse the longest common prefix already in the KV cache; always evaluate at
  // least one token so there are fresh logits to sample from.
  size_t common = 0;
  while (common < cached_.size() && common < tokens.size() && cached_[common] == tokens[common]) ++common;
  if (common == tokens.size()) --common;
  llama_memory_t mem = llama_get_memory(ctx_);
  if (!llama_memory_seq_rm(mem, 0, static_cast<llama_pos>(common), -1)) {
    llama_memory_clear(mem, true);
    common = 0;
  }
  cached_.resize(common);

  const size_t batch = llama_n_batch(ctx_);
  for (size_t i = common; i < tokens.size(); i += batch) {
    const size_t n = std::min(batch, tokens.size() - i);
    std::vector<llama_token> chunk(tokens.begin() + static_cast<long>(i), tokens.begin() + static_cast<long>(i + n));
    if (llama_decode(ctx_, llama_batch_get_one(chunk.data(), static_cast<int32_t>(n))) != 0) {
      llama_memory_clear(mem, true);
      cached_.clear();
      throw LlmError("prompt decoding failed");
    }
    cached_.insert(cached_.end(), chunk.begin(), chunk.end());
  }

  std::unique_ptr<llama_sampler, SamplerDeleter> chain(llama_sampler_chain_init(llama_sampler_chain_default_params()));
  if (!grammar.empty()) {
    llama_sampler* g = llama_sampler_init_grammar(vocab, grammar.c_str(), "root");
    if (!g) throw LlmError("grammar does not parse");
    llama_sampler_chain_add(chain.get(), g);
  }
  llama_sampler_chain_add(chain.get(), llama_sampler_init_greedy());

  Completion out;
  out.cachedTokens = static_cast<int>(common);
  out.promptTokens = static_cast<int>(tokens.size() - common);
  for (int i = 0; i < maxTokens; ++i) {
    llama_token tok = llama_sampler_sample(chain.get(), ctx_, -1);
    if (llama_vocab_is_eog(vocab, tok)) break;
    out.text += piece(tok);
    ++out.genTokens;
    if (static_cast<int>(cached_.size()) + 1 >= nCtx_) break;
    if (llama_decode(ctx_, llama_batch_get_one(&tok, 1)) != 0) throw LlmError("generation failed");
    cached_.push_back(tok);
  }
  out.ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started).count();
  return out;
}

}  // namespace waypoint::llm
