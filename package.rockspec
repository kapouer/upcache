package = "upcache"
source = {
   url = "git://github.com/kapouer/upcache.git"
}
description = {
   summary = "Scope and Tag cache protocols for application - proxy cache keys management.",
   detailed = "This is the lua module to be used with proper nginx config and Node.js application module",
   homepage = "https://github.com/kapouer/upcache",
   license = "MIT"
}
dependencies = {
   "lua >= 5.1",
   "lua-resty-jwt >= 0.1.11",
   "lua-resty-string >= 0.09",
   "lua-messagepack >= 0.3.4"
}
build = {
   type = "builtin",
   modules = {
      ['upcache'] = "upcache.lua",
      ['upcache.scope'] = "upcache/scope.lua",
      ['upcache.tag'] = "upcache/tag.lua",
      ['upcache.common'] = "upcache/common.lua"
   },
   copy_directories = { "nginx" }
}
