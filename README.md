cache-protocols
===============

Scope and Tag cache protocols for application - proxy cache keys management.


Software stack
--------------

The implementation here uses:

- nginx with lua and some modules (see below for installation)
- a shared memory dict (lua) storing url variants
- a remote cache backend (memcached) used by srcache to store responses
- an upstream application (Node.js/express)


Principle
---------

The application interacts with downstream proxies using HTTP response headers,
and the proxies interacts with the application using HTTP request headers.

The legacy HTTP header is "Vary" but it is not sufficient for caching dynamic
resources.

See README-scope and README-tag for further details.

Requirements
------------

The implementations defined use

- a Node.js application
- nginx >= 1.8
- lua-nginx-module
- set-misc-nginx-module  
  https://github.com/openresty/set-misc-nginx-module
- headers-more-nginx-module  
  https://github.com/openresty/headers-more-nginx-module
- lua-messagepack  
  https://github.com/fperrad/lua-MessagePack/

And optionally

- lua-nginx-memcached
- srcache-nginx-module  
  https://github.com/openresty/srcache-nginx-module
- memc-nginx-module  
  https://github.com/openresty/memc-nginx-module
- a memcached backend

Each implementation comes in two parts:

- a Node.js module with an express middleware, e.g.  
  `app.use(require('cache-protocols/version'));`

- a configuration file for nginx


Installation
------------

### nginx & lua

nginx <= 1.9.10

* The nginx source tree,
apt-get source nginx = 1.9.10

* Extract [srcache source](https://github.com/openresty/srcache-nginx-module/archive/v0.30.tar.gz) to nginx/debian/modules/srcache-nginx-module

* Extract [openresty's memc source](https://github.com/openresty/memc-nginx-module/archive/v0.16.tar.gz) to nginx/debian/modules/memc-nginx-module

* Extract [openresty's set-misc source](https://github.com/openresty/set-misc-nginx-module/archive/v0.30.tar.gz) to nginx/debian/modules/set-misc-nginx-module

* headers-more-nginx-module is already available in nginx-extra debian package

* lua-messagepack is available as a debian package

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


Testing
-------

`mocha` will launch user instances of memcached, nginx, and express app and run
full integration tests.

The test suite itself is a great development tool.


License
-------

See LICENSE file.

