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

// multiple tags can be set
app.get('/api/other', tag('zone', 'all'), ...);

// a route can invalidate tags set on other routes
app.put('/api/sample', tag('all'), ...);

// a tag can depend on the route using req.params replacement
// no replacement is made if no param is defined.
app.get('/:domain/list', tag(':domain'), ...);

```

`tag(...)(req, res, next)` can also be called directly, next being optional.

The last argument of tag() can be a function replacing the default deciding
when tags must be incremented:
```
function incFn(req) {
	return req.method != "GET";
}
```

Simplified access to cache-control directives is made available through
`tag.for(...)` or `tag(...).for(...)` method,
which accepts one argument:
- string or number: a ttl in string format or in seconds
- object: options for [express-cache-response-directive](https://github.com/dantman/express-cache-response-directive).

A middleware for disabling cache is also available with `tag.disable()`.

```
app.get('/api/stats', tag.for('1d'), appMw);
app.get('/api/user', tag('user-*').for('10min'), appMw);
app.get('/api/user', tag('user-*').for(3600), appMw);

app.get('/trigger', tag.disable(), ...); // disable cache
```


Cache protocol
--------------

Application tags resources by replying `X-Upcache-Tag: mytag` response header
to set resource to latest known value for that tag, or `X-Upcache-Tag: +mytag`
to increment the value known by the proxy for that tag.

Proxy stores `mytag` as a sub-variant tag key for that url, and stores that
value (or zero if initial) for that tag.
This is like a `Vary: mytag` where `mytag` actual value is stored internally.

The cache key formula is `mytag=curval`. Thus all tagged resources can be
invalidated at once without any performance impact: the variants cache and the
cache storage backend are both LRU caches, so they don't actually need to be
purged - requests keys just need to be changed.

For now only the proxy knows the tags values.

