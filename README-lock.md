Upcache Lock
============

Simple access restrictions for the application and the proxy.

Introduction
------------

Access restrictions often comes with a heavy price to pay regarding the ability
to cache resources.

Upcache Locks let the application dynamically setup the caching proxy (nginx with
memcached in this implementation) so resources cache keys can vary on user grants
based on how resources locks are set.


How it works
------------

Client authenticates using a Json Web Token (jwt) signed with a RSA asymmetric key.

The payload of the jwt must have a "keys" array.

The application writes HTTP response headers so the proxy gets:
- the RSA public key (only if the proxy requested it)
- the list of locks the resource varies upon

When a client requests a resource to the proxy:
- the proxy checks if the client has a valid jwt bearer cookie
- and checks the list of known locks that resource varies upon
- all the client jwt grants that are listed in the list of locks are used
to build a resource cache key
- if the resource is not already cached or if there were no known locks,
the request is handed over to the application.

Note that it's up to the application to make the access control checks,
and return in the HTTP response headers (using upcache node module)
the complete list of potential locks for a given resource:
**that list must not vary on user grants**


Usage
-----

```
const locker = require('upcache').lock({
	publicKey: <rsa public key>,
	privateKey: <rsa private key>,
	algorithm: 'RS256', // default value, optional
	maxAge: age in seconds, must be an integer,
	userProperty: "user", // default value, optional, sets req[userProperty]
	varname: "cookie_bearer" // default value, optional, tells where jwt is
});

app.use(locker.init);

app.post("/login", function(req, res, next) {
	dblogin(req.body.login, req.body.password).then(function(user) {
		user.grants = ['subscriber', 'editor'];
		locker.login(res, user);
	});
});

app.get("/logout", function(req, res, next) {
	locker.logout(res);
	res.sendStatus(204);
});

app.get('/api/user', locker.vary("id-:id", "webmaster"), function(req, res, next) {
  return User.get(req.user.id).then(function(user) {
    if (!req.user.grants.includes('webmaster')) delete user.privateData;
    return user;
  });
});

```

Grants
------

A jwt must carry "grants": an array of alphanumeric strings.

Access is considered granted (or unlocked) if one grant unlocks one of the locks.


Locks
-----

The application returns lists of locks to the proxy.

A lock can be any alphanumeric constant naming a grant - a *litteral* lock.

Otherwise a lock is a *template* lock:

- it can contain a wildcard `str*`, in which case all user grants matching
that lock will be used to build a cache key;
- it can even be `*` in which case all user grants make the cache key vary;
- it can contain a named parameter `str:key` in which case the `:key` is
replaced by a value in the jwt payload[key].


Middlewares and methods
-----------------------

user is an object expected to have a `grants` array of strings.

For defining locks:

- locker.init(req, res, next)  
  middleware setting up handshake and cookie name headers, and req[userProperty]
- locker.vary(locks)  
  returns a middleware that calls locker.headers
- locker.headers(res, locks)  
  sets response headers

Helpers for jwt and cookie handling:

- locker.sign(user, opts)  
  sign user with opts.hostname as issuer, opts.maxAge, returns a jwt
- locker.login(res, user, opts)  
  calls sign and sets bearer
- locker.logout(res)  
  unsets cookie

This library propose a general implementation for access restrictions:

- locker.restrict(lockA, lockB, ...)  
  returns a middleware that sends 401/403 or let through.  
  Mind that `restrict('*')` will vary on all grants while not locking the resource;  
  also `restrict('xxx-:id')` will only lock jwt that do not have an `id` property.  
  To actually restrict by id, see examples in test/lock.js.  
  It calls locker.headers() with the list of locks.


http response headers
---------------------

- X-Upcache-Lock  
  list of locks for the current url

- X-Upcache-Lock-Var (optional, defaults to cookie_bearer)  
  The name of the ngx var that contains the json web token,  
  can be `cookie_xxx` or `http_xxx` where xxx is lowercased, and dashes  
  converted to underscores.

- X-Upcache-Lock-Key (upon request)  
  when the proxy sets X-Upcache-Lock-Key=1 in a request header,
  the application must return the rsa public key in this response header.

