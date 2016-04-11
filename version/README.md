Version protocol
----------------

This protocol is the simplest one possible.
The whole cache is invalidated upon successful non-GET method.

The srcache cache key contains a global $version number.

All requests sent to the application have the X-Cache-Version header set with current version.

The application updates that number by setting an HTTP Response header X-Cache-Version,
and the nginx handlers update that version, thus forcing a miss on all next requests.

This protocol has the following limitations:

* does not vary on cookie
* does not vary on useragent

