Tag protocol
============

Build proxy cache keys using tags set by application, and let application
invalidate all url for a given tag at once.


Usage
-----

```
var tag = require('tag');

// setup a global app tag, 

app.use(tag('app'));

app.post('/protected/purge', tag('app'), function(req, res, next) {
	// see "scope" for setting up permissions
	res.sendStatus(200);
});

// per-resource tagging

app.get('/api/collection', tag('zone'), appMw);
app.post('/api/collection', tag('zone'), appMw);
// or equivalently, since GET already tags the request,
app.post('/api/collection', tag(), appMw);

// multiple tags can be set
app.get('/api/other', tag('zone', 'all'), ...);

// a route can invalidate tags set on other routes
app.put('/api/sample', tag('all'), ...);

```

`tag(req, res, next)` can also be called directly, next being optional.


Cache protocol
--------------

Application tags resources by replying `X-Cache-Tag: mytag` response header
to set resource to latest known value for that tag, or `X-Cache-Tag: +mytag`
to increment the value known by the proxy for that tag.

Proxy stores `mytag` as a sub-variant tag key for that url, and stores that
value (or zero if initial) for that tag.
This is like a `Vary: mytag` where `mytag` actual value is stored internally.

The cache key formula is `mytag=curval`. Thus all tagged resources can be
invalidated at once without any performance impact: the variants cache and the
cache storage backend are both LRU caches, so they don't actually need to be
purged - requests keys just need to be changed.

For now only the proxy knows the tags values.

