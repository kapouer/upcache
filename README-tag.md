Tag protocol
============

Build proxy cache keys using tags set by application, and let application
invalidate all url for a given tag at once.


Usage
-----

```
var tag = require('tag');

app.get('/api/collection', tag('zone'), appMw);
app.post('/api/collection', tag('zone'), appMw);
// or equivalently, since GET already tags the request,
app.post('/api/collection', tag(), appMw);
```

Cache protocol
--------------

- application tags a resource by replying with a `X-Cache-Tag: mytag` response
header - this implies `Vary: X-Cache-Tag` so it does not need to be added.
- proxy stores `mytag` as a sub-variant tag key for that url, and stores that
value for that tag. This is like a `Vary: mytag` where `mytag` actual value is
stored internally.
- the normalization function for that variant returns `mytag=curval`
- when the application sends a `X-Cache-Tag: +mytag` in a response
header, the proxy changes that tag value (typically by incrementing it)
- thus all url using that variant header will be invalidated at once
- the order of processing is not important (hence the choice of a commutative
update operation).

The variants cache and the memcached backend are both LRU caches, so they don't
actually need to be purged - requests keys just need to be changed.

