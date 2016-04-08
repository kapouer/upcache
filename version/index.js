var onHeaders = require('on-headers');

var versionHeader = "X-Cache-Version";
var appVersion = -1;

module.exports = versionMw;

function versionMw(req, res, next) {
	var version = parseInt(req.get(versionHeader));
	if (!isNaN(version)) {
		onHeaders(res, function() {
			setVersionHeaders(version, req, this);
		});
	}
	next();
}

function setVersionHeaders(version, req, res) {
	if (appVersion < version) {
		// cache is out-of-sync, bump version
		appVersion = version + 1;
	} else if (req.method != "GET" && res.statusCode >= 200 && res.statusCode < 300) {
		appVersion++;
	}
	res.set(versionHeader, appVersion);
}
