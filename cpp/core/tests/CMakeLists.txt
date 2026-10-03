add_executable(waypoint_core_tests
  main.cpp
  test_json_color.cpp
  test_walker.cpp
  test_rules.cpp
  test_planner_labels.cpp
  test_golden.cpp
)
target_link_libraries(waypoint_core_tests PRIVATE waypoint_core)
target_compile_definitions(waypoint_core_tests PRIVATE
  WAYPOINT_GOLDEN_DIR="${CMAKE_CURRENT_SOURCE_DIR}/golden")
add_test(NAME core COMMAND waypoint_core_tests)
