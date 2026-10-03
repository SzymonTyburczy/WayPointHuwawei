cmake_minimum_required(VERSION 3.16)
project(waypoint CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

option(WAYPOINT_BUILD_TESTS "Build host unit tests" ON)
option(WAYPOINT_BUILD_CLI "Build the waypoint-cli host tool" ON)
option(WAYPOINT_WITH_LLAMA "Build the llama.cpp LocalBackend" OFF)

if(WAYPOINT_BUILD_TESTS)
  enable_testing()
endif()

add_subdirectory(core)

if(WAYPOINT_BUILD_CLI)
  add_executable(waypoint-cli cli/waypoint_cli.cpp)
  target_link_libraries(waypoint-cli PRIVATE waypoint_core)
endif()

add_subdirectory(llm)

if(WAYPOINT_BUILD_TESTS)
  add_subdirectory(core/tests)
endif()
