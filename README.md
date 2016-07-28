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
  lua-nginx-module (with luajit enabled or else it fails with missing ffi package)
  set-misc-nginx-module
  headers-more-nginx-module
  lua-nginx-memcached
  srcache-nginx-module
  memc-nginx-module

- memcached
  libmemcached-tools (optional)

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

nginx is easily configured with the set of files described in (depending on
where npm installs the module) `./node_modules/upcache/nginx/README.md`.


Usage
-----

Once installed, load appropriate helpers with

```
var app = express();
var tag = require('upcache/tag');
var scope = require('upcache/scope');

app.get('/route', tag('ugc', 'global'), scope.restrict('logged'), ...);
app.post('/route', tag(), scope.restrict('logged'), ...);

```

See README-tag.md and README-scope.md for documentation and tests for more examples.

Mind that `srcache` module honours cache control headers - if the application
sends responses with `Cache-Control: max-age=0`, the resource is not cached.


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

