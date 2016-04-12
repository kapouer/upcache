cache-protocols
===============

Protocols defining how an application should exchange headers with
a proxy in order to be able to maintain an up-to-date cache.


Architecture
------------

An HTTP 1.1 proxy with cache abilities, proxying an upstream application.

The implementations shown here use

- nginx
- lua as configuration language
- shared memory as lookup cache
- remote memcached as data cache, optional, and also replaceable by a non-volatile store
- a Node.js/express application


### Protocol

A protocol defines the function checking request headers against constraints
returned by the application, and the response and request headers exchanged
between application and proxy.

### Caches

There are two caches, the variants cache and the data cache:

- one for storing urls and their variants (in json strings)
- one for storing the data for each key

### Fetch

First it looks up the known variants of the url, each variant defines a function
name (the one of the protocol involved) and stores a list of strings which define
how the url varies. If `function(url, headers, constraints)` return true,
the constraints are used to build the cache key.

Second it fetches the data from the second cache using the key built previously.

### Store

In case of cacheable response, the cache-protocol response headers returned by
the application are stored into the variants cache, and the resulting key
(built similarly to the Fetch phase, without the function call) is used to
store the data into the data cache.


Requirements
------------

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
- headers-more-nginx-module  
  https://github.com/openresty/headers-more-nginx-module/archive/v0.30rc1.tar.gz
- a memcached backend

Each implementation comes in two parts:

- a Node.js module with an express middleware, e.g.  
  `app.use(require('cache-protocols/version'));`

- a configuration file for nginx


Installation
------------

### nginx

nginx <= 1.9.10

* The nginx source tree,
apt-get source nginx = 1.9.10

* Extract [srcache source](https://github.com/openresty/srcache-nginx-module/archive/v0.30.tar.gz) to nginx/debian/modules/srcache-nginx-module

* Extract [openresty's memc source](https://github.com/openresty/memc-nginx-module/archive/v0.16.tar.gz) to nginx/debian/modules/memc-nginx-module

* Extract [openresty's set-misc source](https://github.com/openresty/set-misc-nginx-module/archive/v0.30.tar.gz) to nginx/debian/modules/set-misc-nginx-module

* headers-more-nginx-module is already available in nginx-extra debian package

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

