// Self-contained SHA-256 for the model checksum check (RFC-001 §13 "Hygiene").
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

namespace waypoint::llm {

class Sha256 {
 public:
  Sha256();
  void update(const void* data, size_t len);
  // Lower-case hex digest. The object must not be updated afterwards.
  std::string hexDigest();

 private:
  void block(const uint8_t* p);
  uint32_t h_[8];
  uint8_t buf_[64];
  size_t bufLen_ = 0;
  uint64_t total_ = 0;
};

std::string sha256Hex(const std::string& data);
// Streams the file; returns "" when it cannot be read.
std::string sha256File(const std::string& path);

}  // namespace waypoint::llm
