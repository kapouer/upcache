var debug = require('debug')('upcache:tag');

var headerTag = 'X-Cache-Tag';

module.exports = function() {
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

	return function tagMw(req, res, next) {
		var inc = incFn(req);
		tags.forEach(function(tag) {
			if (inc) tag = '+' + tag;
			res.append(headerTag, tag);
		});
		debug("response tags", res.get(headerTag));
		if (next) next();
	};
};

