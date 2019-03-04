upcache
=======

Caching proxy having cache keys configured by the upstream application,
by setting http response headers.

Upcache has several ways of changing the cache keys:

- [tags](./README-tag.md), version resources by zones
- [locks](./README-lock.md), vary on client json web token grants
- [maps](./README-map.md), vary by mapping http request headers


Requirements
------------

- nginx >= 1.8, with these openresty's modules  
  lua-nginx-module (with luajit enabled or else it fails with missing ffi package)  
  set-misc-nginx-module  
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
var tag = require('upcache').tag;
var locker = require('upcache').lock(config);

app.get('/route', tag('ugc', 'global'), locker.restrict('logged'), ...);
app.post('/route', tag(), locker.restrict('logged'), ...);

```

See README-tag.md and README-lock.md for documentation,
and test/ for more examples.

Mind that `srcache` module honours cache control headers - if the application
sends responses with `Cache-Control: max-age=0`, the resource is not cached,
and `tag().for()` is a facility for doing cache control.


Detection by upstream
---------------------

Upcache adds a `X-Upcache: <version>` header to requests, so upstream application
can detect it is enabled, and which features are available.


Testing
-------

A pre-configured nginx environment is available for testing a Node.js application
that listens on port 3000, with nginx on port 3001 and memcached on port 3002,
simply by launching (depending on ./node_modules/.bin being on PATH or not)
```
npm run upcache
```
which also has an option for filtering output `-g <regexp pattern>`.

`mocha` relies on it for integration tests. No root permissions are needed.


License
-------

See LICENSE file.


