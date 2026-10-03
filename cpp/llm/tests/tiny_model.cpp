// Writes a tiny llama-architecture GGUF with random weights and a real
// tokenizer (copied from llama.cpp's vocab-only test file). Its output is
// noise, which is the point: whatever it generates under a grammar must still
// parse, so the test proves the constraint rather than the model.
#include <random>
#include <stdexcept>
#include <string>

#include "ggml.h"
#include "gguf.h"

namespace {

constexpr int kEmbd = 32, kFf = 64, kHeads = 4, kLayers = 1;

ggml_tensor* tensor(ggml_context* ctx, gguf_context* out, std::mt19937& rng, const std::string& name, int64_t ne0,
                    int64_t ne1, bool ones = false) {
  ggml_tensor* t = ne1 > 0 ? ggml_new_tensor_2d(ctx, GGML_TYPE_F32, ne0, ne1) : ggml_new_tensor_1d(ctx, GGML_TYPE_F32, ne0);
  ggml_set_name(t, name.c_str());
  std::normal_distribution<float> dist(0.0f, 0.02f);
  float* data = static_cast<float*>(t->data);
  for (int64_t i = 0; i < ggml_nelements(t); ++i) data[i] = ones ? 1.0f : dist(rng);
  gguf_add_tensor(out, t);
  return t;
}

}  // namespace

void writeTinyModel(const std::string& vocabPath, const std::string& outPath) {
  gguf_init_params vp{true, nullptr};
  gguf_context* vocab = gguf_init_from_file(vocabPath.c_str(), vp);
  if (!vocab) throw std::runtime_error("cannot read " + vocabPath);
  const int64_t key = gguf_find_key(vocab, "tokenizer.ggml.tokens");
  if (key < 0) throw std::runtime_error("vocab file has no tokens");
  const int64_t nVocab = static_cast<int64_t>(gguf_get_arr_n(vocab, key));

  gguf_context* out = gguf_init_empty();
  gguf_set_kv(out, vocab);
  gguf_set_val_str(out, "general.architecture", "llama");
  gguf_set_val_str(out, "general.name", "waypoint-tiny-random");
  gguf_set_val_u32(out, "general.file_type", 0);
  gguf_set_val_u32(out, "llama.context_length", 1024);
  gguf_set_val_u32(out, "llama.embedding_length", kEmbd);
  gguf_set_val_u32(out, "llama.block_count", kLayers);
  gguf_set_val_u32(out, "llama.feed_forward_length", kFf);
  gguf_set_val_u32(out, "llama.attention.head_count", kHeads);
  gguf_set_val_u32(out, "llama.attention.head_count_kv", kHeads);
  gguf_set_val_u32(out, "llama.rope.dimension_count", kEmbd / kHeads);
  gguf_set_val_f32(out, "llama.attention.layer_norm_rms_epsilon", 1e-5f);

  const size_t bytes = static_cast<size_t>(nVocab * kEmbd * 2 + kLayers * (4 * kEmbd * kEmbd + 3 * kEmbd * kFf + 2 * kEmbd) + kEmbd) *
                           sizeof(float) + 64 * ggml_tensor_overhead();
  ggml_init_params ip{bytes, nullptr, false};
  ggml_context* ctx = ggml_init(ip);
  std::mt19937 rng(42);
  tensor(ctx, out, rng, "token_embd.weight", kEmbd, nVocab);
  tensor(ctx, out, rng, "output_norm.weight", kEmbd, 0, true);
  tensor(ctx, out, rng, "output.weight", kEmbd, nVocab);
  for (int l = 0; l < kLayers; ++l) {
    const std::string p = "blk." + std::to_string(l) + ".";
    tensor(ctx, out, rng, p + "attn_norm.weight", kEmbd, 0, true);
    tensor(ctx, out, rng, p + "attn_q.weight", kEmbd, kEmbd);
    tensor(ctx, out, rng, p + "attn_k.weight", kEmbd, kEmbd);
    tensor(ctx, out, rng, p + "attn_v.weight", kEmbd, kEmbd);
    tensor(ctx, out, rng, p + "attn_output.weight", kEmbd, kEmbd);
    tensor(ctx, out, rng, p + "ffn_norm.weight", kEmbd, 0, true);
    tensor(ctx, out, rng, p + "ffn_gate.weight", kEmbd, kFf);
    tensor(ctx, out, rng, p + "ffn_up.weight", kEmbd, kFf);
    tensor(ctx, out, rng, p + "ffn_down.weight", kFf, kEmbd);
  }
  if (!gguf_write_to_file(out, outPath.c_str(), false)) throw std::runtime_error("cannot write " + outPath);
  ggml_free(ctx);
  gguf_free(out);
  gguf_free(vocab);
}
