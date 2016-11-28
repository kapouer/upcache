0.5.0
=====

- introduced scope.sign(user, opts) to get a jwt without reference to express
- refactor how variants are stored - use the same shared dictionnary
- update nginx config to allow more memory for the shared dictionnaries
- pass HttpError from http-errors module for throwing forbidden/unauthorized errors.
  The corresponding scope() options are no longer in use.

0.6.0
=====

- factored restrict and allowed, renamed allowed to `test`
- parametrized scopes now correctly return wildcard headers

