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
   "lua-resty-jwt = 0.2.3",
	"lua-resty-string >= 0.09",
   "lua-messagepack >= 0.5.3"
}
build = {
   type = "builtin",
   modules = {
      ['upcache'] = "upcache.lua",
      ['upcache.lock'] = "upcache/lock.lua",
      ['upcache.tag'] = "upcache/tag.lua",
      ['upcache.map'] = "upcache/map.lua",
      ['upcache.vary'] = "upcache/vary.lua",
      ['upcache.common'] = "upcache/common.lua"
   },
   copy_directories = { "nginx" }
}
