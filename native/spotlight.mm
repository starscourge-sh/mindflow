// Your notes in Spotlight (Core Spotlight): each note's name and words handed to the Mac's own index, on
// device, so ⌘Space finds them; choosing one opens it in Haligtree (main/spotlight.ts, continue-activity).
//   put([{ id, title, text, kind, date }], done)   add or update notes; done(error or null)
//   remove([id], done)                           take notes out
//   clear(done)                                  take every note out
//   find(words, done)                            done([id]): this app's own items holding the words (for tests)
// Built by native/build-spotlight.sh into resources/spotlight.node.
#import <CoreSpotlight/CoreSpotlight.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#include <mutex>
#include <node_api.h>

static NSString *Text(napi_env env, napi_value value) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, NULL, 0, &length) != napi_ok) return @"";
  char *buffer = (char *)malloc(length + 1);
  napi_get_value_string_utf8(env, value, buffer, length + 1, &length);
  NSString *out = [[NSString alloc] initWithBytes:buffer length:length encoding:NSUTF8StringEncoding] ?: @"";
  free(buffer);
  return out;
}
static NSString *Field(napi_env env, napi_value object, const char *key) {
  napi_value value;
  napi_valuetype type;
  if (napi_get_named_property(env, object, key, &value) != napi_ok || napi_typeof(env, value, &type) != napi_ok || type != napi_string) return @"";
  return Text(env, value);
}

/**
 * A callback kept until the Mac answers, on its own thread, and called back on Node's. `gone`: Node is shutting down
 * (a quit, or a switch to another book, which ends the run with app.exit) and is about to free the function, so an
 * answer that comes later is dropped instead of calling it freed and crashing the app. Read and set under `lock`.
 */
struct Later { napi_threadsafe_function call; bool gone; };
// Made once and never freed: an answer may come while the process ends and frees its statics.
static std::mutex &lock = *new std::mutex;
/** Run by Node as it shuts down, before it frees the function (added after it, so run first). */
static void Gone(void *data) {
  std::lock_guard<std::mutex> hold(lock);
  ((Later *)data)->gone = true;
}
static void Answer(napi_env env, napi_value callback, void *context, void *data) {
  id result = (__bridge_transfer id)data;
  // Node freeing the function with an answer still waiting: Gone has run, nothing more to do.
  if (!env) return;
  Later *later = (Later *)context;
  napi_remove_env_cleanup_hook(env, Gone, later);
  {
    // Done may still be letting go of the function on the Mac's thread.
    std::lock_guard<std::mutex> hold(lock);
  }
  delete later;
  napi_value argument, nothing;
  napi_get_undefined(env, &nothing);
  if ([result isKindOfClass:NSArray.class]) {
    NSArray *ids = result;
    napi_create_array_with_length(env, ids.count, &argument);
    for (NSUInteger i = 0; i < ids.count; i++) {
      napi_value one;
      napi_create_string_utf8(env, [ids[i] UTF8String], NAPI_AUTO_LENGTH, &one);
      napi_set_element(env, argument, i, one);
    }
  } else if ([result isKindOfClass:NSString.class]) {
    napi_create_string_utf8(env, [result UTF8String], NAPI_AUTO_LENGTH, &argument);
  } else {
    napi_get_null(env, &argument);
  }
  if (callback) napi_call_function(env, nothing, callback, 1, &argument, NULL);
}
static Later *Keep(napi_env env, napi_value callback) {
  Later *later = new Later{NULL, false};
  napi_value name;
  napi_create_string_utf8(env, "spotlight", NAPI_AUTO_LENGTH, &name);
  napi_create_threadsafe_function(env, callback, NULL, name, 0, 1, NULL, NULL, later, Answer, &later->call);
  napi_add_env_cleanup_hook(env, Gone, later);
  return later;
}
static void Done(Later *later, id result) {
  std::lock_guard<std::mutex> hold(lock);
  if (later->gone) return;
  // The queue has no limit, so this never waits: the lock is held only a moment.
  napi_call_threadsafe_function(later->call, (__bridge_retained void *)(result ?: NSNull.null), napi_tsfn_nonblocking);
  napi_release_threadsafe_function(later->call, napi_tsfn_release);
}
static void (^Finished(Later *later))(NSError *) {
  return ^(NSError *error) { Done(later, error ? error.localizedDescription : nil); };
}

static napi_value Put(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2], nothing;
  napi_get_undefined(env, &nothing);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 2) return nothing;
  uint32_t count = 0;
  napi_get_array_length(env, argv[0], &count);
  NSMutableArray *items = [NSMutableArray array];
  for (uint32_t i = 0; i < count; i++) {
    napi_value one;
    napi_get_element(env, argv[0], i, &one);
    CSSearchableItemAttributeSet *set = [[CSSearchableItemAttributeSet alloc] initWithContentType:UTTypeText];
    set.title = Field(env, one, "title");
    set.contentDescription = Field(env, one, "text");
    set.textContent = Field(env, one, "text");
    set.kind = Field(env, one, "kind");
    NSString *date = Field(env, one, "date");
    if (date.length) set.contentModificationDate = [[NSISO8601DateFormatter new] dateFromString:date];
    [items addObject:[[CSSearchableItem alloc] initWithUniqueIdentifier:Field(env, one, "id") domainIdentifier:@"notes" attributeSet:set]];
  }
  [CSSearchableIndex.defaultSearchableIndex indexSearchableItems:items completionHandler:Finished(Keep(env, argv[1]))];
  return nothing;
}

static napi_value Remove(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2], nothing;
  napi_get_undefined(env, &nothing);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 2) return nothing;
  uint32_t count = 0;
  napi_get_array_length(env, argv[0], &count);
  NSMutableArray *ids = [NSMutableArray array];
  for (uint32_t i = 0; i < count; i++) {
    napi_value one;
    napi_get_element(env, argv[0], i, &one);
    [ids addObject:Text(env, one)];
  }
  [CSSearchableIndex.defaultSearchableIndex deleteSearchableItemsWithIdentifiers:ids completionHandler:Finished(Keep(env, argv[1]))];
  return nothing;
}

static napi_value Clear(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1], nothing;
  napi_get_undefined(env, &nothing);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1) return nothing;
  [CSSearchableIndex.defaultSearchableIndex deleteAllSearchableItemsWithCompletionHandler:Finished(Keep(env, argv[0]))];
  return nothing;
}

static napi_value Find(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2], nothing;
  napi_get_undefined(env, &nothing);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 2) return nothing;
  NSString *words = [Text(env, argv[0]) stringByReplacingOccurrencesOfString:@"\"" withString:@""];
  Later *call = Keep(env, argv[1]);
  NSString *asked = [NSString stringWithFormat:@"title == \"*%@*\"cd || textContent == \"*%@*\"cd", words, words];
  CSSearchQuery *query = [[CSSearchQuery alloc] initWithQueryString:asked attributes:@[ @"title" ]];
  NSMutableArray *found = [NSMutableArray array];
  query.foundItemsHandler = ^(NSArray<CSSearchableItem *> *items) {
    @synchronized(found) { for (CSSearchableItem *item in items) [found addObject:item.uniqueIdentifier]; }
  };
  query.completionHandler = ^(NSError *error) { Done(call, error ? (id)error.localizedDescription : (id)[found copy]); };
  [query start];
  return nothing;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor all[] = {
    {"put", NULL, Put, NULL, NULL, NULL, napi_default, NULL},
    {"remove", NULL, Remove, NULL, NULL, NULL, napi_default, NULL},
    {"clear", NULL, Clear, NULL, NULL, NULL, napi_default, NULL},
    {"find", NULL, Find, NULL, NULL, NULL, napi_default, NULL},
  };
  napi_define_properties(env, exports, 4, all);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
