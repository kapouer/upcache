var debug = require('debug')('upcache:tag');

var ctrl = require('express-cache-ctrl');

var headerTag = 'X-Cache-Tag';

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
		var inc = incFn(req);
		tags.forEach(function(tag) {
			tag = replaceParams(tag, req.params);
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
	var forMw;
	if (typeof ttl == "object") forMw = ctrl.custom(ttl);
	else forMw = ctrl.public(ttl);
	forMw.tag = tagFn;
	return forMw;
}

function replaceParams(tag, params) {
	return tag.replace(/\/:(\w+)/g, function(str, name) {
		var val = params[name];
		if (val !== undefined) {
			return '/' + val;
		} else {
			return '/:' + name;
		}
	});
}
