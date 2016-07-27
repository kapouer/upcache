var debug = require('debug')('upcache:tag');

var headerTag = 'X-Cache-Tag';

module.exports = function() {
	var tags = Array.from(arguments);

	return function tagMw(req, res, next) {
		var resTags = res.get(headerTag) || [];
		tags.forEach(function(tag) {
			if (!~resTags.indexOf(tag)) resTags.push(tag);
		});
		// unicode string comparison
		resTags.sort();

		if (req.method != "GET") resTags = resTags.map(function(tag) {
			return '+' + tag;
		});
		debug("response tags", resTags);
		if (resTags.length) res.set(headerTag, resTags);
		if (next) next();
	};
};

