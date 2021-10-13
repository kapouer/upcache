Upcache Map
===========

Maps a request path to another request path.

Introduction
------------

This is useful for catch-all pages.

The mapping applies after other causes of variations.

Usage
-----

```js
const map = require('upcache').map;
const tag = require('upcache').tag;

app.get('*', tag('app'), function(req, res, next) {
  decideContent(req.path).then(function(html) {
    res.send(html);
  }).catch(function(err) {
    map(res, '/.well-known/404');
    res.send(htmlNotFound);
  });
});
```

http response headers
---------------------

* X-Upcache-Map
  contains the path to map the request path to.
