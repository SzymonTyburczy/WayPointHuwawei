# Platform-independent core: no React Native, HarmonyOS or third-party headers.
# Consumed by the host build (cpp/CMakeLists.txt) and by the RNOH package
# (harmony/waypoint/src/main/cpp/CMakeLists.txt).
add_library(waypoint_core STATIC
  src/announce.cpp
  src/api.cpp
  src/color.cpp
  src/finalize.cpp
  src/json.cpp
  src/labels.cpp
  src/model.cpp
  src/planner.cpp
  src/raw_tree.cpp
  src/rules.cpp
  src/text.cpp
)
target_include_directories(waypoint_core PUBLIC include)
set_target_properties(waypoint_core PROPERTIES POSITION_INDEPENDENT_CODE ON)
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  target_compile_options(waypoint_core PRIVATE -Wall -Wextra -Wpedantic)
endif()
