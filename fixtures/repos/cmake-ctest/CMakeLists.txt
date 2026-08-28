cmake_minimum_required(VERSION 3.20)
project(contribkit_cmake_ctest LANGUAGES NONE)

include(CTest)
enable_testing()
add_test(NAME ctest_smoke COMMAND "${CMAKE_COMMAND}" -E true)
