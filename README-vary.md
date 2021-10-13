Upcache Vary
============

`Vary` response header can configure cache key by mapping a request header value
to a response header value.

There are two cases:

- legacy Vary, request value is mapped to cache key value with a different
response header than the request header, seen with Accept* content negotiation.
- modern Vary, request value is mapped with the same response header as the
request header, seen with Client Hints.

Vary on Accept
--------------

```text
Vary: Accept
Content-Type: <Value>
```

The request Accept value is mapped to the response Content-Type value to build
the cache key.

Vary on Accept-`Name`
---------------------

```text
Vary: Accept-<Name>
Content-<Name>: <Value>
```

The request Accept-X header value is mapped to the response Content-X header
value to build the cache key.

Vary on `HeaderName`
--------------------

```text
Vary: <Name>
<Name>: <MappedValue>
```

If there is no `Name` response header, the request `Name` header value is used
directly to build the cache key.

However this behavior is really not optimal, especially when dealing with
User-Agent or other very variable request headers.

Similar to content negotiation, or Client Hints, setting the header value in the
response will allow a mapping from request value to response value.

request:

```text
User-Agent: Mozilla/5.0 AppleWebKit/537.36 Chrome/73.0.3683.75 Safari/537.36
```

response:

```text
Vary: User-Agent
User-Agent: chrome/73.0.0
```

Usage
-----

There is no js module since it's only a matter of setting standard headers.

```js
const tag = require('upcache').tag;
const polyfills = require('polyfill-library');

app.get('/polyfill.js', tag('app'), function(req, res, next) {
  const opts = {
    uaString: req.get('user-agent'),
    minify: true,
    features: {
      'es6': { flags: ['gated'] }
    }
  };
  // let's assume polyfills already caches bundles by targetedFeatures
  polyfills.getPolyfills(opts).then(function({targetedFeatures, bundle}) {
    var hashKey = objectHash(targetedFeatures);
    res.vary('User-Agent');
    res.set('User-Agent', hashkey);
    res.send(bundle);
  });
});
```

http response headers
---------------------

All standard headers discussed above.
