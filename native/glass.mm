// Real glass under a window's own shapes, Raycast's way: the Mac's blur of the desktop (NSVisualEffectView, behind
// the window), dark or light, cut to the rounded shapes the page draws (quick capture's card, its round controls and
// its hint, or a sticky's card) and nothing else, so the clear room round them stays clear. Electron's own vibrancy
// fills the whole window with square-ish corners; this is the one piece it cannot do.
//   glass(handle, dark, shapes)   handle: win.getNativeWindowHandle(); shapes: [[x, y, width, height, radius], ...]
//                                 in the page's pixels from its top left. No shapes: the glass is taken away.
//   nonActivating(handle)         a panel that takes the keys and clicks without making Haligtree the front app.
//   spell(text, start, length)    whether the word at that place in the text is misspelt, as the Mac judges it.
//   learn(word, how)              the word learnt, unlearnt, or let by for this run.
// Built by native/build-glass.sh into resources/glass.node.
#import <AppKit/AppKit.h>
#include <node_api.h>
#include <objc/message.h>
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

// Electron's panel (type: 'panel') only says it is non-activating: its styleMask getter adds
// NSWindowStyleMaskNonactivatingPanel, but its setter never passes the mask on to NSPanel, and NSPanel tells the window
// server through that setter alone. So the window server was never told (_preventsActivation read NO), and quick capture
// taking the keys, or a click on it or a sticky, could make Haligtree the front app (SETFRONT in the Mac's log), which
// AeroSpace followed to the main window's workspace. This sets the one switch NSPanel's own setter sets for that mask.
// True when the window now prevents activation; false where the Mac has no such switch (nothing is changed then).
static napi_value NonActivating(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1], out;
  napi_get_boolean(env, false, &out);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1) return out;
  NSView *content = contentOf(env, argv[0]);
  NSWindow *window = content.window;
  SEL set = NSSelectorFromString(@"_setPreventsActivation:"), get = NSSelectorFromString(@"_preventsActivation");
  // Only a window that already says it is a non-activating panel (Electron's panel is not an NSPanel by class).
  if (!(window.styleMask & NSWindowStyleMaskNonactivatingPanel) || ![window respondsToSelector:set] || ![window respondsToSelector:get]) return out;
  ((void (*)(id, SEL, BOOL))objc_msgSend)(window, set, YES);
  napi_get_boolean(env, ((BOOL (*)(id, SEL))objc_msgSend)(window, get), &out);
  return out;
}

// Spelling, of the Mac's own checker (NSSpellChecker): the one that draws the red underline in every window, asked
// the same way the underline is (the text round the word, so the language is judged from the sentence and a Spanish
// word in a Spanish sentence is not "wrong"). A millisecond or so once the checker is awake.
//   spell(text, start, length)   {flagged, guesses (five at most), language}: the word is text[start, start + length).
//   spell()                      wakes the checker (its first answer is the slow one) and answers nothing.
//   learn(word, how)             how 'learn': into the Mac's own dictionary, for every app; 'unlearn': out of it again;
//                                'ignore': let by until the app quits, nothing written (a test run's way), and
//                                'unignore': no longer let by.
static NSInteger spellTag = 0;
static NSInteger SpellTag() {
  if (!spellTag) spellTag = [NSSpellChecker uniqueSpellDocumentTag];
  return spellTag;
}

static NSString *TextOf(napi_env env, napi_value value) {
  size_t length = 0;
  if (napi_get_value_string_utf16(env, value, NULL, 0, &length) != napi_ok) return nil;
  std::vector<char16_t> units(length + 1);
  if (napi_get_value_string_utf16(env, value, units.data(), length + 1, &length) != napi_ok) return nil;
  return [NSString stringWithCharacters:(const unichar *)units.data() length:length];
}

static napi_value Spell(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3], nothing, out, value;
  napi_get_undefined(env, &nothing);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok) return nothing;
  @autoreleasepool {
    NSSpellChecker *checker = [NSSpellChecker sharedSpellChecker];
    if (argc < 3) {
      [checker checkString:@"awake" range:NSMakeRange(0, 5) types:NSTextCheckingTypeSpelling options:nil inSpellDocumentWithTag:SpellTag() orthography:NULL wordCount:NULL];
      return nothing;
    }
    NSString *text = TextOf(env, argv[0]);
    double start = 0, length = 0;
    napi_get_value_double(env, argv[1], &start);
    napi_get_value_double(env, argv[2], &length);
    if (!text || start < 0 || length < 1 || start + length > text.length) return nothing;
    NSRange word = NSMakeRange((NSUInteger)start, (NSUInteger)length);
    NSOrthography *orthography = nil;
    NSArray<NSTextCheckingResult *> *found = [checker checkString:text range:NSMakeRange(0, text.length) types:NSTextCheckingTypeSpelling options:nil inSpellDocumentWithTag:SpellTag() orthography:&orthography wordCount:NULL];
    BOOL flagged = NO;
    for (NSTextCheckingResult *one in found) {
      if (one.resultType == NSTextCheckingTypeSpelling && NSIntersectionRange(one.range, word).length) flagged = YES;
    }
    // The language the Mac read the text as: "und" where it is none of those it checks (nothing is flagged there).
    // Guesses are asked in that language; where it could not say, in the one the checker is set to.
    NSString *language = orthography.dominantLanguage ?: @"und";
    NSArray<NSString *> *guesses = flagged ? [checker guessesForWordRange:word inString:text language:[language isEqualToString:@"und"] ? checker.language : language inSpellDocumentWithTag:SpellTag()] : nil;
    napi_create_object(env, &out);
    napi_get_boolean(env, flagged, &value);
    napi_set_named_property(env, out, "flagged", value);
    napi_create_string_utf8(env, language.UTF8String ?: "", NAPI_AUTO_LENGTH, &value);
    napi_set_named_property(env, out, "language", value);
    napi_value list;
    uint32_t count = (uint32_t)MIN(guesses.count, (NSUInteger)5);
    napi_create_array_with_length(env, count, &list);
    for (uint32_t i = 0; i < count; i++) {
      napi_create_string_utf8(env, guesses[i].UTF8String, NAPI_AUTO_LENGTH, &value);
      napi_set_element(env, list, i, value);
    }
    napi_set_named_property(env, out, "guesses", list);
    return out;
  }
}

static napi_value Learn(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2], out;
  napi_get_boolean(env, false, &out);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 2) return out;
  @autoreleasepool {
    NSString *word = TextOf(env, argv[0]), *how = TextOf(env, argv[1]);
    if (!word.length) return out;
    NSSpellChecker *checker = [NSSpellChecker sharedSpellChecker];
    if ([how isEqualToString:@"learn"]) [checker learnWord:word];
    else if ([how isEqualToString:@"unlearn"]) [checker unlearnWord:word];
    else if ([how isEqualToString:@"ignore"]) [checker ignoreWord:word inSpellDocumentWithTag:SpellTag()];
    else if ([how isEqualToString:@"unignore"]) {
      NSMutableArray<NSString *> *kept = [[checker ignoredWordsInSpellDocumentWithTag:SpellTag()] mutableCopy] ?: [NSMutableArray array];
      [kept removeObject:word];
      [checker setIgnoredWords:kept inSpellDocumentWithTag:SpellTag()];
    }
    else return out;
    napi_get_boolean(env, true, &out);
    return out;
  }
}

NAPI_MODULE_INIT() {
  napi_value fn;
  if (napi_create_function(env, "watchScroll", NAPI_AUTO_LENGTH, WatchScroll, NULL, &fn) == napi_ok) napi_set_named_property(env, exports, "watchScroll", fn);
  if (napi_create_function(env, "glass", NAPI_AUTO_LENGTH, Glass, NULL, &fn) == napi_ok) napi_set_named_property(env, exports, "glass", fn);
  if (napi_create_function(env, "nonActivating", NAPI_AUTO_LENGTH, NonActivating, NULL, &fn) == napi_ok) napi_set_named_property(env, exports, "nonActivating", fn);
  if (napi_create_function(env, "glassFrame", NAPI_AUTO_LENGTH, GlassFrame, NULL, &fn) == napi_ok) napi_set_named_property(env, exports, "glassFrame", fn);
  if (napi_create_function(env, "spell", NAPI_AUTO_LENGTH, Spell, NULL, &fn) == napi_ok) napi_set_named_property(env, exports, "spell", fn);
  if (napi_create_function(env, "learn", NAPI_AUTO_LENGTH, Learn, NULL, &fn) == napi_ok) napi_set_named_property(env, exports, "learn", fn);
  return exports;
}
