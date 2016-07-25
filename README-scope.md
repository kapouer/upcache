Json Web Token Scopes protocol
==============================

Using a shared private key between the application and the proxy,
it is possible to define scopes-based cache keys.


Install
-------

```
npm install upcache
```


What are scopes ?
-----------------

Scopes are a common way to define fine-grain accesses to an API, see
for example:
https://auth0.com/blog/2014/12/02/using-json-web-tokens-as-api-keys/


Usage
-----

```
var scope = require('upcache/scope')({
	publicKey: <rsa public key>,
	privateKey: <rsa private key>,
	algorithm: 'RS256', // optional
	issuer: the application name,
	maxAge: age in seconds,
	userProperty: "user", // optional, populates req[userProperty] if set
	forbidden: res => res.sendStatus(403), // optional
	unauthorized: res => res.sendStatus(401) // optional
});

app.post("/login", function(req, res, next) {
	dblogin(req.body.login, req.body.password).then(function(user) {
		user.scopes = {
			subscriber: {
				read: true
			},
			editor: {
				write: true
			},
			[`user-${user.id}`]: true
		};
		scope.login(res, user);
	});
});

app.get("/logout", function(req, res, next) {
	scope.logout(res);
	res.sendStatus(204);
});

app.get('/api/user', scope.restrict("&user-*", "admin"), myMidleware);
```

Restrictions
------------

A restriction is an alphanumeric string.

Multiple permissions can be given as arguments,
in which case the bearer can match one of them or none.

A boolean restriction `true` means 

A restriction can be made mandatory by prefixing it with a `&`.

A restriction can contain a wildcard `*` which must match at least one char.

The above example with more control
```
app.get("/api/user", function(req, res, next) {
	if (scope.allowed(req, "permA", "permB")) {
		next();
	} else {
		res.sendStatus(403);
	}
}, appMw);
```

There is also a convenient shorthand for defining restrictions by actions
```
app.all('/api/books', scope.restrict(
	"admin", {
		read: "bookReader",
		write: "bookWriter"
	}, {
		del: "cleaner"
	}
), appMw);
```

In which case a simple wildcard restriction letting everyone read access is
often useful:

```
app.all('/api/items', scope.restrict({
	read: "*", // if no restriction is given, it effectively blocks access
	write: "itemWriter"
}), appMw);
```

Bearer scopes
-------------

Actions are read, add, save, del; and write is a shorthand for add+save+del.

User scopes is an object with permissions as keys and an object mapping actions
to booleans as value.
That object can be replaced by boolean true as a shorthand for
`{ read: true, write: true }`.


Cache protocol
--------------

The caching proxy must be able to build request keys out of a request url
and scopes read from a JWT.

The application is responsible (in its HTTP response headers) to provide two
pieces of information to the proxy:

- X-Cache-Restrictions  
  a list of restrictions as defined above

- X-Cache-Grants  
  the actual list of granted bearer scopes (by matching restrictions)

- X-Cache-Bearer (optional, defaults to cookie_bearer)  
  this can be `http_bearer`, or `cookie_bearer`, following nginx variable names.

Examples where application grants access to bearers:
- with scope A or scope B (but not none): `A,B`
- with optional scope A and mandatory scope B: `A,+B`
- with scope A and scope B: `+A,+B`
- with scope /root/* or scope /other/*: `/root/*,/other/*`
- any scope: `*` (meaning all scopes are used to build the key)


The cache is not responsible for granting or denying access: it must just knows
how to build a cache key given a bearer and those rules.

For the sake of simplicity, this implementation is not perfect: there is no way
to tell the cache to not build a key with A and B scopes (if the bearer has them)
even if the application doesn't require both.


Public key handshake
--------------------

If the proxy doesn't have the public RSA key for jwt payload verification of the
current domain, it adds this request header as soon as possible
- X-Cache-Key-Handshake: 1

The application is responsible for sending back in the response this header:
- X-Cache-Key-Handshake: MFwwDQY...

The application can send that header in a response at any time, to update the
proxy copy of the public key after a change (the js scope lib deals with that).

