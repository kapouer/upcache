package = "cache-protocols"
version = "0.1.0-2"
source = {
   url = "git://github.com/kapouer/cache-protocols",
   tag = '0.1.0'
}
description = {
   summary = "Scope and Tag cache protocols for application - proxy cache keys management.",
   detailed = "This is the lua module to be used with proper nginx config and Node.js application module",
   homepage = "https://github.com/kapouer/cache-protocols",
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
      scope = "src/scope.lua",
      tag = "src/tag.lua"
   }
}
