Json Web Token Scopes protocol
==============================

Using a shared private key between the application and the proxy,
it is possible to define scopes-based cache keys.

Scopes are a common way to define fine-grain accesses to an API, see
for example:
https://auth0.com/blog/2014/12/02/using-json-web-tokens-as-api-keys/

jwt.scopes = ["user 25", "webmaster"]

or even finer scopes:

jwt.scopes = {
	"user 25": { read: true, modify: true },
	"webmaster": { read: true, write: true }
};

Fetching any url from cache will typically depend on the scopes being granted,
and one can map HTTP methods to what is granted by the scope:

read: GET
modify/change/write: PUT, PATCH
create/write: POST
delete/write: DELETE


Why JWT ?
---------

Because it is easy to verify signature in proxy or in application, we have
implementations in all languages, in particular in lua/nodejs:

https://github.com/x25/luajwt
and jsonwebtoken npm module.


Why scopes ?
------------

Because they're announced by their bearer, and not an opaque grant mecanism -
which i great for cache key construction.


Store
-----

The application must use the cookie named "Bearer" to store the jsonwebtoken,
and it must send a response with an HTTP header
X-Cache-Scope: webmaster
X-Cache-Scope: user 25

Only scopes giving read access are listed here.

** the cache key depends on upstream response **  // CHECK IF POSSIBLE

store key = granted scopes + url
store variant = url: granted scopes


Fetch
-----

Upon request, the lookup will return zero, one, or several lists of scopes.
If the request jwt.scopes exists and match one of these lists, the lookup
is successful and data is fetched from cache.

** there are ways to improve this, like flagging a scope as mandatory **


Limitations
-----------

* as defined here, if a single scope is granted in a response but the request
  claims more scopes, the lookup will fail because the protocol cannot assume
  the response won't change when requesting with more scopes.
  This is a problem in the given example, if a given url depends actually on a
  single scope. The client should request with only the minimum set of scopes
  required for that url... Or the protocol must define a way for the application
  to tell the proxy there won't ever be a variant of the url that grants a wider
  set of scopes.
  
