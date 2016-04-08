var onHeaders = require('on-headers');

exports.header = "X-Cache-Version";
exports.version = -1;

exports.init = function(app) {
	app.use(cacheVersionMw);
	return app;
};

function cacheVersionMw(req, res, next) {
	var version = parseInt(req.get(exports.header));
	if (!isNaN(version)) {
		onHeaders(res, function() {
			cacheVersionHeaders(version, req, this);
		});
	}
	next();
}

function cacheVersionHeaders(version, req, res) {
	if (exports.version < version) {
		// cache is out-of-sync, bump version
		exports.version = version + 1;
	} else if (req.url.startsWith("/api") && req.method != "GET" && res.statusCode >= 200 && res.statusCode < 300) {
		exports.version++;
	}
	res.set(exports.header, exports.version);
}
