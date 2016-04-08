cache-protocols
===============

Protocols defining how an application should exchange headers with
a proxy in order to be able to maintain an up-to-date cache.

The implementations defined here require:

- a Node.js application
- nginx >= 1.8
- lua-nginx-module
- lua-nginx-memcached
- srcache-nginx-module  
  https://github.com/openresty/srcache-nginx-module/archive/v0.30.tar.gz
- memc-nginx-module  
  https://github.com/openresty/memc-nginx-module/archive/v0.16.tar.gz
- a memcached backend

Each implementation comes in two parts:

- a Node.js module with an express middleware, e.g.  
  ```app.use(require('cache-protocols').version);```

- a configuration file for nginx


Version protocol
----------------

This protocol is the simplest one possible.

The srcache cache key contains a global $version number.

All requests sent to the application have the X-Cache-Version header set with current version.

The application updates that number by setting an HTTP Response header X-Cache-Version,
and the nginx handlers update that version, thus forcing a miss on all next requests.



