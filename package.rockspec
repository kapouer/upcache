package = "upcache"
version = "0.1.0-1"
source = {
   url = "https://github.com/kapouer/upcache/archive/0.1.0.tar.gz"
}
description = {
   summary = "Scope and Tag cache protocols for application - proxy cache keys management.",
   detailed = "This is the lua module to be used with proper nginx config and Node.js application module",
   homepage = "https://github.com/kapouer/upcache",
   license = "MIT"
}
dependencies = {
   "lua >= 5.1",
   "lua-resty-jwt >= 0.1.5",
   "lua-resty-string >= 0.09",
   "lua-messagepack >= 0.3.4"
}
build = {
   type = "builtin",
   modules = {
      ['upcache.scope'] = "src/upcache/scope.lua",
      ['upcache.tag'] = "src/upcache/tag.lua"
   }
}
