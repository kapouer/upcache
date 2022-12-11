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


Vary on Cookie name
-------------------

```test
Vary: X-Cookie-<Name>
X-Cookie-<Name>: <Value>
```

This is like Accept-`Name` but varies on a virtual X-Cookie-`Name` header,
which corresponds to the parsed cookie name.
If a value is defined in the response, the request cookie value is mapped to it.


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

Similar to content negotiation, or Client Hints, the response can tell
how to map the request header value to another value.

This not only improves cache storage, but cache hits, since the mapping
itself is kept indefinitely (unless overwritten by another resource).

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

app.get('/polyfill.js', tag('app'), async (req, res, next) => {
  const opts = {
    uaString: req.get('user-agent'),
    minify: true,
    features: {
      'es6': { flags: ['gated'] }
    }
  };
  // let's assume polyfills already caches bundles by targetedFeatures
  const { targetedFeatures, bundle } = await polyfills.getPolyfills(opts);
  const hashKey = objectHash(targetedFeatures);
  res.vary('User-Agent');
  res.set('User-Agent', hashkey);
  res.send(bundle);
});
```

http response headers
---------------------

All standard headers discussed above.
