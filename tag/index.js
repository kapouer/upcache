var onHeaders = require('on-headers');

module.exports = cacheTagMw;

var globalVersion = 0;

function cacheTagMw(req, res, next) {
	onHeaders(res, function() {
		if (res.statusCode >= 200 && res.statusCode < 300) {
			if (req.method != "GET") {
				globalVersion++;
			}
			res.set('X-Cache-Tag', 'global=' + globalVersion);
		}
	});
	next();
}

