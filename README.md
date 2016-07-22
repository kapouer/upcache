upcache
=======

Scope and Tag cache protocols between proxy and upstream application.

This implementation can build cache keys for
- resource tagging and REST invalidation
- resource scoping

by exchanging headers in existing HTTP requests/responses between proxy and application.


Requirements
------------

- nginx >= 1.8, with these openresty's modules
  lua-nginx-module
  set-misc-nginx-module
  headers-more-nginx-module
  lua-nginx-memcached
  srcache-nginx-module
  memc-nginx-module

- memcached
  libmemcached-tools

- a Node.js express app


Install
-------

The Node.js app need the module
```
npm install upcache
```

The nginx configuration need the module
```
luarocks install upcache
```

nginx is easily configured with the set of files described in `./nginx/README.md`.


Usage
-----

Once installed, load appropriate helpers with

```
var tag = require('upcache/tag');
var scope = require('upcache/scope');
```

See README-tag.md and README-scope.md for documentation and tests for more examples.


Tests
-----

`mocha` will launch user instances of memcached, nginx, and express app and run
full integration tests. No root permissions are needed.

The test suite itself is a great development tool.

Also it is possible to dump memcached using
```
memcdump --servers=127.0.0.1:11211
```


License
-------

See LICENSE file.

