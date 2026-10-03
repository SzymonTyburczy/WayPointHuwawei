#include <cstdio>
#include <fstream>
#include <string>

#include "test.hpp"
#include "waypoint/llm/sha256.hpp"

using namespace waypoint::llm;

TEST(sha256_known_vectors) {
  EXPECT_EQ(sha256Hex(""), std::string("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"));
  EXPECT_EQ(sha256Hex("abc"), std::string("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
  EXPECT_EQ(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
            std::string("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"));
  EXPECT_EQ(sha256Hex(std::string(1000000, 'a')),
            std::string("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"));
}

TEST(sha256_file_streams_and_handles_missing) {
  const char* path = "waypoint_sha256_test.bin";
  {
    std::ofstream f(path, std::ios::binary);
    f << std::string(3 << 20, 'x');
  }
  EXPECT_EQ(sha256File(path), sha256Hex(std::string(3 << 20, 'x')));
  std::remove(path);
  EXPECT_EQ(sha256File("/nonexistent/model.gguf"), std::string(""));
}

int main() { return wptest::runAll(); }
