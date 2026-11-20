// "Send to Haligtree" in every app's Services menu (right-click selected words anywhere): macOS hands the
// words to Haligtree's services provider, which passes them, with the app they came from and the page's
// address when the app gives one, to JavaScript. Declared in electron-builder.yml (NSServices); macOS lists it
// once the app is in /Applications.
//   listen(callback)            callback({ text, app, url, title }) for each sending
//   send(text, url?)            the same path, from a pasteboard of its own, for tests: as if sent from Finder
//   Files picked in Finder (right-click, Quick Actions or Services, "Send to Haligtree"): callback({ files })
//   with their paths, one a line; sendFiles(paths) does the same for tests.
// Built by native/build-services.sh into resources/services.node.
#import <AppKit/AppKit.h>
#include <node_api.h>

static napi_threadsafe_function told = NULL;

struct Sent { NSString *text, *app, *url, *title, *files; };

static void Call(napi_env env, napi_value callback, void *context, void *data) {
  Sent *sent = (Sent *)data;
  if (env && callback) {
    napi_value object, value, nothing;
    napi_create_object(env, &object);
    const char *keys[] = {"text", "app", "url", "title", "files"};
    NSString *values[] = {sent->text, sent->app, sent->url, sent->title, sent->files};
    for (int i = 0; i < 5; i++) {
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
- (void)sendFilesToHaligtree:(NSPasteboard *)board userData:(NSString *)data error:(NSString **)error;
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
  if (told) napi_call_threadsafe_function(told, new Sent{text, app, url, title, @""}, napi_tsfn_nonblocking);
}
- (void)sendFilesToHaligtree:(NSPasteboard *)board userData:(NSString *)data error:(NSString **)error {
  NSArray<NSURL *> *urls = [board readObjectsForClasses:@[NSURL.class] options:@{NSPasteboardURLReadingFileURLsOnlyKey: @YES}] ?: @[];
  NSMutableArray<NSString *> *paths = [NSMutableArray array];
  for (NSURL *url in urls) if (url.path.length) [paths addObject:url.path];
  if (!paths.count) {
    if (error) *error = @"There were no files to send";
    return;
  }
  if (told) napi_call_threadsafe_function(told, new Sent{@"", @"Finder", @"", @"", [paths componentsJoinedByString:@"\n"]}, napi_tsfn_nonblocking);
}
@end

static HTServices *provider = nil;

/**
 * Node shutting down (a quit, or a switch to another book, which ends the run with app.exit): a sending that came
 * after Node freed the function would call it freed and crash the app. Run first (added after the function), on the
 * app's own thread, where sendings arrive too.
 */
static void Stop(void *) { told = NULL; }

static napi_value Listen(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1], nothing, name;
  napi_get_undefined(env, &nothing);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1) return nothing;
  if (told) {
    napi_remove_env_cleanup_hook(env, Stop, NULL);
    napi_release_threadsafe_function(told, napi_tsfn_release);
  }
  napi_create_string_utf8(env, "services", NAPI_AUTO_LENGTH, &name);
  napi_create_threadsafe_function(env, argv[0], NULL, name, 0, 1, NULL, NULL, NULL, Call, &told);
  napi_unref_threadsafe_function(env, told);
  napi_add_env_cleanup_hook(env, Stop, NULL);
  provider = provider ?: [HTServices new];
  // The menu line is declared in Info.plist; nothing to tell macOS at launch.
  NSApp.servicesProvider = provider;
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

static napi_value SendFiles(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1], nothing;
  napi_get_undefined(env, &nothing);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1 || !provider) return nothing;
  char buffer[65536];
  size_t length = 0;
  napi_get_value_string_utf8(env, argv[0], buffer, sizeof buffer, &length);
  NSMutableArray<NSURL *> *urls = [NSMutableArray array];
  for (NSString *path in [[NSString stringWithUTF8String:buffer] componentsSeparatedByString:@"\n"]) if (path.length) [urls addObject:[NSURL fileURLWithPath:path]];
  NSPasteboard *board = [NSPasteboard pasteboardWithUniqueName];
  [board clearContents];
  [board writeObjects:urls];
  NSString *error = nil;
  [provider sendFilesToHaligtree:board userData:@"" error:&error];
  [board releaseGlobally];
  return nothing;
}
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor all[] = {
    {"listen", NULL, Listen, NULL, NULL, NULL, napi_default, NULL},
    {"send", NULL, Send, NULL, NULL, NULL, napi_default, NULL},
    {"sendFiles", NULL, SendFiles, NULL, NULL, NULL, napi_default, NULL},
  };
  napi_define_properties(env, exports, 3, all);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
