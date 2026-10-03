# Waypoint RNOH native package. Added by the app's entry/src/main/cpp/CMakeLists.txt:
#
#   add_subdirectory("${OH_MODULE_DIR}/@waypoint/react-native-waypoint/src/main/cpp" ./waypoint)
#   target_link_libraries(rnoh_app PUBLIC rnoh_waypoint)
#
# The platform-independent core comes from cpp/core in this repository; the
# llama.cpp backend is optional (-DWAYPOINT_WITH_LLAMA=ON, see cpp/llm).
cmake_minimum_required(VERSION 3.13)
set(CMAKE_VERBOSE_MAKEFILE on)

set(WAYPOINT_REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../../.." CACHE PATH "Waypoint repository root")
option(WAYPOINT_WITH_LLAMA "Link the on-device llama.cpp backend" OFF)

add_subdirectory("${WAYPOINT_REPO_ROOT}/cpp/core" ./waypoint_core)

add_library(rnoh_waypoint SHARED
  WaypointCoreTurboModule.cpp
  WaypointPlatformTurboModule.cpp
)
target_include_directories(rnoh_waypoint PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(rnoh_waypoint PUBLIC rnoh waypoint_core)

if(WAYPOINT_WITH_LLAMA)
  set(WAYPOINT_BUILD_TESTS OFF)
  add_subdirectory("${WAYPOINT_REPO_ROOT}/cpp/llm" ./waypoint_llm)
  target_sources(rnoh_waypoint PRIVATE WaypointLlmTurboModule.cpp)
  # PUBLIC: WaypointPackage.h is compiled into the app's PackageProvider.cpp too.
  target_compile_definitions(rnoh_waypoint PUBLIC WAYPOINT_WITH_LLAMA=1)
  target_link_libraries(rnoh_waypoint PUBLIC waypoint_llm)
endif()
