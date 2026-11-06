# Qt 6 backend namunasi (QOpenGLWidget). Qt 6 (Widgets + OpenGLWidgets) o'rnatilgan bo'lishi kerak:
#   cmake -S . -B build-qt -G Ninja -DLG_BUILD_QT=ON -DCMAKE_PREFIX_PATH=<Qt>/6.x/<kit>
find_package(Qt6 REQUIRED COMPONENTS Widgets OpenGLWidgets)
set(CMAKE_AUTOMOC ON)

add_executable(qt_demo main.cpp glass_widget.cpp glass_widget.hpp)
target_include_directories(qt_demo PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../native)
target_link_libraries(qt_demo PRIVATE liquidglass_gl Qt6::Widgets Qt6::OpenGLWidgets)
target_compile_definitions(qt_demo PRIVATE LG_SHADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../shaders/liquidglass.frag")
if(WIN32)
  set_target_properties(qt_demo PROPERTIES WIN32_EXECUTABLE OFF)
endif()
