nginx.conf
----------

A sample nginx config for running tests.
Do not use in production.


snippets/cache-proxy.conf
-------------------------

Goes unmodified in /etc/nginx/snippets/

```
npm install -g upcache
cd /etc/nginx/snippets
ln -s /usr/local/lib/node_modules/upcache/nginx/snippets/cache-location.conf
ln -s /usr/local/lib/node_modules/upcache/nginx/snippets/cache-memc.conf
```


conf.d/cache-server.conf
------------------------

Lua package path might need to be configured - or simply removed, depending
on how is it installed (on debian, luarocks packages are on lua path by default).

memcached port needs to be configured - on debian, system-installed is listening
on port 11211.


sites-enabled/upstream.conf
---------------------------

A bare Node.js upstream sample config, rename and configure at will.

