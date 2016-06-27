cache-protocols
===============

This module proposes a working implementation of an effective proxy cache,
with both a passive (using normalization functions) Vary implementation, and
an active (invalidable by the application) cache mecanism.


Software stack
--------------

The implementation here uses:

- nginx with lua and some modules (see below for installation)
- a shared memory dict (lua) storing url variants
- a remote cache backend (memcached) used by srcache to store responses
- an upstream application (Node.js/express)


Principle
---------

The application interacts with downstream proxies using HTTP headers.

The main way to do so is using Vary response headers to instruct proxies how to
build future cache key requests for a given url.

The proxy is configured with customizable normalization functions for request
headers (with sane defaults for the most common ones), so that the request key
does not vary too much to be useful.

On top of that, there is a need for a mecanism that allows the application to
tag url and invalidate all url for a given tag at once:

- application tags a resource by replying with a `X-Cache-Tag: mytag=val` response
header - this implies `Vary: X-Cache-Tag` so it does not need to be added.
- proxy stores `mytag` as a variant tag key for that url (same as in Vary field)
and stores that value for that tag.
- the normalization function for that variant returns `mytag=curval`
- when the application sends a `X-Cache-Tag: mytag=newval` in a response
header, the proxy changes that tag value (typically by incrementing it)
- thus all url using that variant header will be invalidated at once

The variants cache and the memcached backend are both LRU caches, so they don't
actually need to be purged - requests keys just need to be changed.


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

