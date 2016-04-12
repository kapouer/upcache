Version protocol
----------------

This protocol is the simplest and the coarsest.
The whole cache is invalidated upon successful non-GET method.

TODO: ability to restrict cache by domain, by path


Store
-----

The application maintains an application Cache Version number.

On application initialization it is set to -1.

If the application receives a request with X-Cache-Version set, the application
Cache Version number is set to that value + 1.

If the application receives a successful non-GET request, it increments its
Cache Version number.

The application then sends a response with X-Cache-Version set to its current
value.

store key = version + url
store lookup = version


Fetch
-----

The url lookup returns a version, which is used to build the cache key
(version + url).


Limitations
-----------

This protocol is obviously going to invalidate the whole cache more often
than necessary. However it is very efficient at doing so, since it mutates
the cache key instead of trying to purge the cache itself.

