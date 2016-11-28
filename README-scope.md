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
	userProperty: "user" // optional, populates req[userProperty] if set
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
		scope.login(res, user); // this sets a cookie, scope.sign(user) returns signed bearer
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
in which case the bearer must match at least one of them to get access.

A restriction can be made mandatory by prefixing it with a `&`.

A restriction can contain a wildcard `*` which match zero or more chars.
In this case, all scopes matching the restriction will be used to build the
resource cache key.

A restriction can also be defined for each type of action, where actions are
mapped like this:

> read: head, get
> write: add/del/save
> add: post
> del: delete
> save: put, patch

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

In this situation, it is often needed to restrict a write action but not a read
action.

A natural way of doing this would be to not restrict all actions that are not
defined - but it would be very error prone since it would give access in case
one forgets to mention some action.

To avoid such mistakes, a special meaning is given to restrictions when they
are booleans:
* true means do not restrict access, and since it always match it effectively
empties the restriction list
* false means never grant access - not setting anything has the same effect


```
app.all('/api/items', scope.restrict({
	read: true,
	write: "itemWriter"
}), appMw);
```
Here all clients will get read access to the same version of the resource,
and only clients with the right scope will have write access.

Note that a set of restrictions like
`{ read: true, write: "one" }, { read: "readtwo", write: "two"}` will never
match the "readtwo" restriction. Instead, to grant access to public and
to a "readtwo" scope, it is simpler to declare a "public" permission and
automatically log all users with it.


Checking restrictions can also be called manually using `test` method,
which accepts multiple parameters, or an array for the list of scopes to test.

```
app.get("/api/user", function(req, res, next) {
	if (scope.test(req, "permA", "permB")) {
		next();
	} else {
		res.sendStatus(403);
	}
}, appMw);
```

Note: `test` sends headers.


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

- X-Upcache-Scope  
  a list of restrictions as defined above

- X-Upcache-Grant (optional optimization)  
  the actual list of granted bearer scopes

- X-Upcache-Bearer (optional, defaults to cookie_bearer)  
  this can be `http_bearer`, or `cookie_bearer`, following nginx variable names.

Examples where application grants access to bearers:
- with scope A or scope B (but not none): `A,B`
- with optional scope A and mandatory scope B: `A,+B`
- with scope A and scope B: `+A,+B`
- with scope /root/* or scope /other/*: `/root/*,/other/*`
- any scope: `*` (all scopes will match and be used to build the key)

The cache is not responsible for granting or denying access: it must just knows
how to build a cache key given a bearer and those rules.

A client without any bearer is always granted the empty scope "", which will
always match the wildcard scope "*".


Public key handshake
--------------------

If the proxy doesn't have the public RSA key for jwt payload verification of the
current domain, it adds this request header as soon as possible
- X-Upcache-Key-Handshake: 1

The application is responsible for sending back in the response this header:
- X-Upcache-Key-Handshake: MFwwDQY...

The application can send that header in a response at any time, to update the
proxy copy of the public key after a change (the js scope lib deals with that).

