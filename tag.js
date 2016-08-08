var debug = require('debug')('upcache:tag');

var ctrl = require('express-cache-ctrl');

var common = require('./common');

var headerTag = 'X-Upcache-Tag';
var proxyTag = 'X-Upcache';

module.exports = tagFn;

tagFn.for = forFn;
tagFn.disable = ctrl.disable;

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
		if (req.get(proxyTag)) {
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

function forFn(ttl) {
	var forMw;
	if (typeof ttl == "object") forMw = ctrl.custom(ttl);
	else forMw = ctrl.public(ttl);
	return forMw;
}

