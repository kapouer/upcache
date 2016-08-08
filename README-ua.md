User-Agent protocol
===================

Using the same database for user agent parsing, the application can
return which conditions were applied to a resource.


Installation
------------

https://github.com/MySiteApp/nginx-ua-parse-module/archive/0.3.tar.gz
npm install useragent

Do not forget to update the database on both sides.


Store
-----

The application parses User-Agent request header, modifies the resource
accordingly (typically using a different html template) and send a list of
browser minversion maxversion
in X-Upcache-Agent HTTP response header.

store key = browser-ranges-list + url
store lookup = browser-ranges-list


Fetch
-----

First a lookup is made on the url, and if X-Upcache-Agent lists are found,
User-Agent is parsed and matched against each list. The first match is used to
build the request key = list + url.

