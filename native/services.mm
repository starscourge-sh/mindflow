// "Send to Haligtree" in every app's Services menu (right-click selected words anywhere): macOS hands the
// words to Haligtree's services provider, which passes them, with the app they came from and the page's
// address when the app gives one, to JavaScript. Declared in electron-builder.yml (NSServices); macOS lists it
// once the app is in /Applications.
//   listen(callback)            callback({ text, app, url, title }) for each sending
//   send(text, url?)            the same path, from a pasteboard of its own, for tests: as if sent from Finder
// Built by native/build-services.sh into resources/services.node.
#import <AppKit/AppKit.h>
#include <node_api.h>

static napi_threadsafe_function told = NULL;

struct Sent { NSString *text, *app, *url, *title; };

static void Call(napi_env env, napi_value callback, void *context, void *data) {
  Sent *sent = (Sent *)data;
  if (env && callback) {
    napi_value object, value, nothing;
    napi_create_object(env, &object);
    const char *keys[] = {"text", "app", "url", "title"};
    NSString *values[] = {sent->text, sent->app, sent->url, sent->title};
    for (int i = 0; i < 4; i++) {
      if (!values[i].length) continue;
      napi_create_string_utf8(env, values[i].UTF8String, NAPI_AUTO_LENGTH, &value);
      napi_set_named_property(env, object, keys[i], value);
    }
    napi_get_undefined(env, &nothing);
    napi_call_function(env, nothing, callback, 1, &object, NULL);
  }
  delete sent;
}

@interface HTServices : NSObject
- (void)sendToHaligtree:(NSPasteboard *)board userData:(NSString *)data error:(NSString **)error;
@end
@implementation HTServices
- (void)sendToHaligtree:(NSPasteboard *)board userData:(NSString *)data error:(NSString **)error {
  NSString *text = [board stringForType:NSPasteboardTypeString] ?: @"";
  NSString *url = [board stringForType:NSPasteboardTypeURL] ?: @"";
  // Safari and others put the page's address and title together under this older name.
  NSArray *titled = [board propertyListForType:@"WebURLsWithTitlesPboardType"];
  NSString *title = @"";
  if ([titled isKindOfClass:NSArray.class] && titled.count == 2) {
    NSArray *urls = titled[0], *titles = titled[1];
    if (!url.length && [urls isKindOfClass:NSArray.class] && urls.count) url = urls[0];
    if ([titles isKindOfClass:NSArray.class] && titles.count) title = titles[0];
  }
  if (!text.length) {
    if (error) *error = @"There were no words to send";
    return;
  }
  // The words were picked in the app in front a moment ago: that is where they came from.
  NSRunningApplication *front = NSWorkspace.sharedWorkspace.frontmostApplication;
  NSString *app = [front.bundleIdentifier isEqualToString:NSBundle.mainBundle.bundleIdentifier] ? @"" : (front.localizedName ?: @"");
  if (told) napi_call_threadsafe_function(told, new Sent{text, app, url, title}, napi_tsfn_nonblocking);
}
@end

static HTServices *provider = nil;

static napi_value Listen(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1], nothing, name;
  napi_get_undefined(env, &nothing);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1) return nothing;
  if (told) napi_release_threadsafe_function(told, napi_tsfn_release);
  napi_create_string_utf8(env, "services", NAPI_AUTO_LENGTH, &name);
  napi_create_threadsafe_function(env, argv[0], NULL, name, 0, 1, NULL, NULL, NULL, Call, &told);
  napi_unref_threadsafe_function(env, told);
  provider = provider ?: [HTServices new];
  NSApp.servicesProvider = provider;
  NSUpdateDynamicServices();
  return nothing;
}

static napi_value Send(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2], nothing;
  napi_get_undefined(env, &nothing);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1 || !provider) return nothing;
  char buffer[65536];
  size_t length = 0;
  NSPasteboard *board = [NSPasteboard pasteboardWithUniqueName];
  [board clearContents];
  napi_get_value_string_utf8(env, argv[0], buffer, sizeof buffer, &length);
  [board setString:[NSString stringWithUTF8String:buffer] forType:NSPasteboardTypeString];
  if (argc > 1 && napi_get_value_string_utf8(env, argv[1], buffer, sizeof buffer, &length) == napi_ok && length)
    [board setString:[NSString stringWithUTF8String:buffer] forType:NSPasteboardTypeURL];
  NSString *error = nil;
  [provider sendToHaligtree:board userData:@"" error:&error];
  [board releaseGlobally];
  return nothing;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor all[] = {
    {"listen", NULL, Listen, NULL, NULL, NULL, napi_default, NULL},
    {"send", NULL, Send, NULL, NULL, NULL, napi_default, NULL},
  };
  napi_define_properties(env, exports, 2, all);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
