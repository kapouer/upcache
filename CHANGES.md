CHANGES
=======

0.5.0
-----

- introduced scope.sign(user, opts) to get a jwt without reference to express
- refactor how variants are stored - use the same shared dictionnary
- update nginx config to allow more memory for the shared dictionnaries
- pass HttpError from http-errors module for throwing forbidden/unauthorized errors.
  The corresponding scope() options are no longer in use.

0.6.0
-----

- factored restrict and allowed, renamed allowed to `test`
- parametrized scopes now correctly return wildcard headers

0.7.0
-----

- issuer is the hostname and cannot be configured

0.8.0
-----

- scope.serializeBearer(req, user, opts)
- `make luarocks` installs lua modules in a local tree

0.9.0
-----

- nothing is cached unless tagged
- no particular peremption is set (used to be 1 day by default if nothing was set)

1.0.0
-----

- major breaking changes: scopes are now locks and has been simplified a lot.

2.2.0
-----

- upcache.disabled (the lua module) let lua-ngx code disable upcache

2.6.0
-----

- more es6 javascript
- fix Vary handling when no response header is set
- test Vary with Map

2.7.0
-----

- tag.for cannot override tag.disable
- better support for headers lists

2.8.0
-----

- lock: req.user.grants is always set
