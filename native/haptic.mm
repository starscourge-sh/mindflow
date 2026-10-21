// A light tap on a Force Touch trackpad, the one the Mac gives when a window
// lines up with a guide. One call, `tap(kind)`: 0 alignment (a sticky lining
// up with an edge or another sticky), 1 a level change, 2 a generic tap.
// macOS plays it only while a finger is on a Force Touch trackpad; anywhere
// else it does nothing, which is what is wanted.
//
// Plain N-API (node_api.h), so the one binary loads in any Electron.
// Built by native/build-haptic.sh into resources/haptic.node.
#import <AppKit/AppKit.h>
#include <node_api.h>

static napi_value Tap(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  int32_t kind = 0;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) == napi_ok && argc > 0) napi_get_value_int32(env, argv[0], &kind);
  NSHapticFeedbackPattern pattern = kind == 1 ? NSHapticFeedbackPatternLevelChange : kind == 2 ? NSHapticFeedbackPatternGeneric : NSHapticFeedbackPatternAlignment;
  [[NSHapticFeedbackManager defaultPerformer] performFeedbackPattern:pattern performanceTime:NSHapticFeedbackPerformanceTimeNow];
  return NULL;
}

NAPI_MODULE_INIT() {
  napi_value fn;
  if (napi_create_function(env, "tap", NAPI_AUTO_LENGTH, Tap, NULL, &fn) == napi_ok) napi_set_named_property(env, exports, "tap", fn);
  return exports;
}
