// Real glass under a window's own shapes, Raycast's way: the Mac's blur of the desktop (NSVisualEffectView, behind
// the window), dark or light, cut to the rounded shapes the page draws (quick capture's card, its round controls and
// its hint, or a sticky's card) and nothing else, so the clear room round them stays clear. Electron's own vibrancy
// fills the whole window with square-ish corners; this is the one piece it cannot do.
//   glass(handle, dark, shapes)   handle: win.getNativeWindowHandle(); shapes: [[x, y, width, height, radius], ...]
//                                 in the page's pixels from its top left. No shapes: the glass is taken away.
// Built by native/build-glass.sh into resources/glass.node.
#import <AppKit/AppKit.h>
#include <node_api.h>
#include <vector>

static const NSInteger kTag = 0x6c617373; // "lass": the view this module put in, found again by its tag.

struct Shape { CGFloat x, y, w, h, r; };

/** The glass, known by its tag (NSView's own tag cannot be set from outside), and never in the way of a click. */
@interface MFGlassView : NSVisualEffectView
@end
@implementation MFGlassView
- (NSInteger)tag { return kTag; }
- (NSView *)hitTest:(NSPoint)point { return nil; }
@end

static NSView *contentOf(napi_env env, napi_value buffer) {
  void *data = NULL;
  size_t length = 0;
  if (napi_get_buffer_info(env, buffer, &data, &length) != napi_ok || length < sizeof(void *)) return nil;
  NSView *view = (__bridge NSView *)(*(void **)data);
  return view.window ? view.window.contentView : view;
}

static napi_value Glass(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_value nothing;
  napi_get_undefined(env, &nothing);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 3) return nothing;
  NSView *content = contentOf(env, argv[0]);
  if (!content) return nothing;
  bool dark = false;
  napi_get_value_bool(env, argv[1], &dark);
  std::vector<Shape> shapes;
  uint32_t count = 0;
  napi_get_array_length(env, argv[2], &count);
  for (uint32_t i = 0; i < count; i++) {
    napi_value one;
    if (napi_get_element(env, argv[2], i, &one) != napi_ok) continue;
    double v[5] = {0, 0, 0, 0, 0};
    for (uint32_t k = 0; k < 5; k++) {
      napi_value n;
      if (napi_get_element(env, one, k, &n) == napi_ok) napi_get_value_double(env, n, &v[k]);
    }
    if (v[2] > 0 && v[3] > 0) shapes.push_back({v[0], v[1], v[2], v[3], v[4]});
  }

  NSVisualEffectView *glass = [content viewWithTag:kTag];
  if (shapes.empty()) {
    [glass removeFromSuperview];
    return nothing;
  }
  if (!glass) {
    glass = [[MFGlassView alloc] initWithFrame:content.bounds];
    glass.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    // Kept on while another app is in front, as Raycast's is: the box is a panel that does not take the app's focus.
    glass.state = NSVisualEffectStateActive;
    [content addSubview:glass positioned:NSWindowBelow relativeTo:nil];
  }
  // Dark: the heavy HUD material, the desktop's colour coming through darkened. Light: the popover's, paler.
  glass.material = dark ? NSVisualEffectMaterialHUDWindow : NSVisualEffectMaterialPopover;
  glass.appearance = [NSAppearance appearanceNamed:dark ? NSAppearanceNameVibrantDark : NSAppearanceNameVibrantLight];
  // Never stretched with the window: the mask is drawn at the window's size now, so a window that grows (room for a
  // menu below the card) would stretch it, and the blurred shapes slid down and grew tall away from the card they
  // belong under. Held at this size, pinned to the window's top left (where the page measures from), until the page
  // sends its shapes again for the new size (lib/glass.ts sends on every change of the window's size too).
  glass.autoresizingMask = content.isFlipped ? (NSViewMaxXMargin | NSViewMaxYMargin) : (NSViewMaxXMargin | NSViewMinYMargin);
  glass.frame = content.bounds;
  NSSize size = content.bounds.size;
  std::vector<Shape> drawn = shapes;
  // The mask: opaque where the shapes are, clear elsewhere. Drawn flipped, so the page's top-left numbers fit as they are.
  glass.maskImage = [NSImage imageWithSize:size flipped:YES drawingHandler:^BOOL(NSRect) {
    [[NSColor blackColor] setFill];
    for (const Shape &s : drawn) {
      CGFloat r = MIN(s.r, MIN(s.w, s.h) / 2);
      [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(s.x, s.y, s.w, s.h) xRadius:r yRadius:r] fill];
    }
    return YES;
  }];
  return nothing;
}

// For a probe (qa/glass-grow.mjs): the glass's size and its mask's, against the window's: [viewW, viewH, maskW, maskH,
// contentW, contentH], or nothing when there is no glass. The mask drawn for one size and shown at another is stretched.
static napi_value GlassFrame(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1], nothing, out;
  napi_get_undefined(env, &nothing);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1) return nothing;
  NSView *content = contentOf(env, argv[0]);
  NSVisualEffectView *glass = content ? [content viewWithTag:kTag] : nil;
  if (!glass) return nothing;
  double v[6] = {glass.frame.size.width, glass.frame.size.height, glass.maskImage.size.width, glass.maskImage.size.height, content.bounds.size.width, content.bounds.size.height};
  napi_create_array_with_length(env, 6, &out);
  for (uint32_t i = 0; i < 6; i++) {
    napi_value n;
    napi_create_double(env, v[i], &n);
    napi_set_element(env, out, i, n);
  }
  return out;
}

// Swipe back's fingers (swipe-back.tsx): a page hears the wheel but never whether the fingers lifted. The scroll
// NSEvent says: its phase ends when they lift (a glide may follow, as momentum); resting fingers send no end.
//   watchScroll(listen)   listen(kind, windowNumber): kind 'began' or 'ended' (the fingers lifted).
static napi_threadsafe_function scrollListener = NULL;
static id scrollMonitor = nil;

static void CallScroll(napi_env env, napi_value js, void *context, void *data) {
  NSArray *pair = (__bridge_transfer NSArray *)data;
  if (!env) return;
  napi_value args[2], global;
  napi_create_string_utf8(env, [(NSString *)pair[0] UTF8String], NAPI_AUTO_LENGTH, &args[0]);
  napi_create_double(env, [(NSNumber *)pair[1] doubleValue], &args[1]);
  napi_get_global(env, &global);
  napi_call_function(env, global, js, 2, args, NULL);
}

static napi_value WatchScroll(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1], nothing, name;
  napi_get_undefined(env, &nothing);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1 || scrollMonitor) return nothing;
  napi_create_string_utf8(env, "scroll", NAPI_AUTO_LENGTH, &name);
  if (napi_create_threadsafe_function(env, argv[0], NULL, name, 0, 1, NULL, NULL, NULL, CallScroll, &scrollListener) != napi_ok) return nothing;
  napi_unref_threadsafe_function(env, scrollListener);
  scrollMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskScrollWheel handler:^NSEvent *(NSEvent *event) {
    NSString *kind = nil;
    if (event.phase == NSEventPhaseBegan) kind = @"began";
    else if (event.phase == NSEventPhaseEnded || event.phase == NSEventPhaseCancelled) kind = @"ended";
    if (kind) napi_call_threadsafe_function(scrollListener, (__bridge_retained void *)@[kind, @(event.windowNumber)], napi_tsfn_nonblocking);
    return event;
  }];
  return nothing;
}

NAPI_MODULE_INIT() {
  napi_value fn;
  if (napi_create_function(env, "watchScroll", NAPI_AUTO_LENGTH, WatchScroll, NULL, &fn) == napi_ok) napi_set_named_property(env, exports, "watchScroll", fn);
  if (napi_create_function(env, "glass", NAPI_AUTO_LENGTH, Glass, NULL, &fn) == napi_ok) napi_set_named_property(env, exports, "glass", fn);
  if (napi_create_function(env, "glassFrame", NAPI_AUTO_LENGTH, GlassFrame, NULL, &fn) == napi_ok) napi_set_named_property(env, exports, "glassFrame", fn);
  return exports;
}
