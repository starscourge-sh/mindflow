// A light tap on a Force Touch trackpad, the one the Mac gives when a window
// lines up with a guide. One call, `tap(kind)`: 0 alignment (a sticky lining
// up with an edge or another sticky), 1 a level change, 2 a generic tap.
// macOS plays it only while a finger is on a Force Touch trackpad; anywhere
// else it does nothing, which is what is wanted.
//
// Plain N-API (node_api.h), so the one binary loads in any Electron.
// Also `cursorInBackground()` (below).
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

// The cursor from a window of an app that is not the active one. Quick capture is a panel that takes the
// keys without making Haligtree the active app (src/main/index.ts, `type: 'panel'`), and macOS shows only the
// active app's cursor changes, so its buttons kept the arrow and its writing never showed the I-beam.
// The window server's own switch for that, the one menu bar apps use. Says whether it is now on.
extern "C" int _CGSDefaultConnection(void);
extern "C" CGError CGSSetConnectionProperty(int, int, CFStringRef, CFTypeRef);
extern "C" CGError CGSCopyConnectionProperty(int, int, CFStringRef, CFTypeRef *);
static napi_value CursorInBackground(napi_env env, napi_callback_info info) {
  int connection = _CGSDefaultConnection();
  CGSSetConnectionProperty(connection, connection, CFSTR("SetsCursorInBackground"), kCFBooleanTrue);
  CFTypeRef now = NULL;
  bool on = CGSCopyConnectionProperty(connection, connection, CFSTR("SetsCursorInBackground"), &now) == kCGErrorSuccess && now == kCFBooleanTrue;
  if (now) CFRelease(now);
  napi_value result;
  napi_get_boolean(env, on, &result);
  return result;
}

NAPI_MODULE_INIT() {
  napi_value cursor;
  if (napi_create_function(env, "cursorInBackground", NAPI_AUTO_LENGTH, CursorInBackground, NULL, &cursor) == napi_ok) napi_set_named_property(env, exports, "cursorInBackground", cursor);
  napi_value fn;
  if (napi_create_function(env, "tap", NAPI_AUTO_LENGTH, Tap, NULL, &fn) == napi_ok) napi_set_named_property(env, exports, "tap", fn);
  return exports;
}
