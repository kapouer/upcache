var debug = require('debug')('upcache:tag');

var ctrl = {};
require('express-cache-response-directive')()(null, ctrl, function() {});

var common = require('./common');

var headerTag = 'X-Upcache-Tag';

module.exports = tagFn;

function forFn(opts) {
	if (typeof opts == "string") opts = {
		maxAge: opts
	};
	return function(req, res, next) {
		ctrl.cacheControl.call(res, opts);
		next();
	};
}

tagFn.for = forFn;

tagFn.disable = function() {
	return function(req, res, next) {
		ctrl.cacheControl.call(res, {
			noCache: true,
			mustRevalidate: true,
			proxyRevalidate: true
		});
		next();
	};
};

function tagFn() {
	var tags = Array.from(arguments);
	var len = tags.length;
	var incFn;
	if (len && typeof tags[len - 1] == "function") {
		incFn = tags.pop();
	} else {
		incFn = function(req) {
			return req.method != "GET";
		};
	}

	function tagMw(req, res, next) {
		// prevent conditional requests if proxy is caching
		// it would have been done in the proxy, after a cache miss, if
		// current proxy allowed that easily
		if (req.get(common.headerProxy)) {
			// TODO deal with If-Match, In-Unmodified-Since, If-Range
			delete req.headers["if-none-match"];
			delete req.headers["if-modified-since"];
		}
		var inc = incFn(req);
		tags.forEach(function(tag) {
			tag = common.replacements(tag, req.params);
			if (inc) tag = '+' + tag;
			res.append(headerTag, tag);
		});
		debug("response tags", res.get(headerTag));
		if (next) next();
	}

	tagMw.for = function(ttl) {
		return function(req, res, next) {
			tagMw(req, res, function(err) {
				if (err) return next(err);
				forFn(ttl)(req, res, next);
			});
		};
	};
	return tagMw;
}

