Upcache Map
===========

Maps specific request headers values to application-defined values.

Introduction
------------

The application may need to send different content for the same url,
by varying on a specific request header.

Also the response may be the same for many different request headers upon
which the content vary.

The logic is often only known by the application, thus Upcache Map helps by
letting the proxy build cache keys based on mappings obtained through the
application response http headers.

Typical examples: user-agent polyfills, language negotiation, ...


Usage
-----

```
const map = require('upcache').map;
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
    map(res, 'User-Agent', hashKey);
    res.send(bundle);
  });
});
```

http response headers
---------------------

* X-Upcache-Map  
  header-name=value

This header is enough to configure the proxy so it maps the request header
value to the given value in the response.

The header-name=response-value is then part of the cache key.

