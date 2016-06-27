var onHeaders = require('on-headers');

module.exports = cacheTagMw;

function cacheTagMw(req, res, next) {
	onHeaders(res, function() {
		if (res.statusCode >= 200 && res.statusCode < 300) {
			var tags = req.get('X-Cache-Tag');
			tags = tags && tags.split(',') || [];
			if (req.method != "GET") tags = tags.map(function(tag) {
				return '+' + tag;
			});
			if (tags.length) res.set('X-Cache-Tag', tags);
		}
	});
	next();
}

