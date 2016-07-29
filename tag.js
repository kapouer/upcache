var debug = require('debug')('upcache:tag');

var ctrl = require('express-cache-ctrl');

var headerTag = 'X-Cache-Tag';

module.exports = tagFn;

tagFn.for = forFn;

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
		var inc = incFn(req);
		tags.forEach(function(tag) {
			if (inc) tag = '+' + tag;
			res.append(headerTag, tag);
		});
		debug("response tags", res.get(headerTag));
		if (next) next();
	}

	tagMw.for = forFn;
	return tagMw;
}

function forFn(ttl) {
	var forMw = (typeof ttl == "object") ? ctrl.custom(ttl) : ctrl.public(ttl);
	forMw.tag = tagFn;
	return forMw;
}

