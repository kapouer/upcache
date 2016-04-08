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
- set-misc-nginx-module  
  https://github.com/openresty/set-misc-nginx-module/archive/v0.30.tar.gz
- a memcached backend

Each implementation comes in two parts:

- a Node.js module with an express middleware, e.g.  
  `app.use(require('cache-protocols/version'));`

- a configuration file for nginx


Version protocol
----------------

This protocol is the simplest one possible.
The whole cache is invalidated upon successful non-GET method.

The srcache cache key contains a global $version number.

All requests sent to the application have the X-Cache-Version header set with current version.

The application updates that number by setting an HTTP Response header X-Cache-Version,
and the nginx handlers update that version, thus forcing a miss on all next requests.


Installation
------------

### nginx

nginx <= 1.9.10

* The nginx source tree,
apt-get source nginx = 1.9.10

* Extract [srcache source](https://github.com/openresty/srcache-nginx-module/archive/v0.30.tar.gz) to nginx/debian/modules/srcache-nginx-module

* Extract [openresty's memc source](https://github.com/openresty/memc-nginx-module/archive/v0.16.tar.gz) to nginx/debian/modules/memc-nginx-module

* Extract [openresty's set-misc source](https://github.com/openresty/set-misc-nginx-module/archive/v0.30.tar.gz) to nginx/debian/modules/set-misc-nginx-module

To build nginx-extra debian package with those two modules, simply append
those two flags to extras_configure_flags in debian/rules:
```
--add-module=$(MODULESDIR)/memc-nginx-module
--add-module=$(MODULESDIR)/srcache-nginx-module
--add-module=$(MODULESDIR)/set-misc-nginx-module
```


### memcached

Install these packages:
- memcached
- lua-nginx-memcached 0.10 (or later ?)
- libmemcached-tools

Start memcached:
systemctl enable memcached

To dump memcached:
memcdump --servers=127.0.0.1:11211

