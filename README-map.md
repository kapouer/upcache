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

app.get('*', tag('app'), async (req, res, next) => {
  try {
    const html = await decideContent(req.path);
    res.send(html);
  } catch(err) {
    map(res, '/.well-known/404');
    res.send(htmlNotFound);
  }
});
```

http response headers
---------------------

* X-Upcache-Map
  contains the path to map the request path to.
