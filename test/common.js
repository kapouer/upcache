var http = require('http');
var URL = require('url');

exports.get = function(uri) {
	return new Promise(function(resolve, reject) {
		if (typeof uri == "string") uri = URL.parse(uri);
		uri = Object.assign({}, uri);
		http.get(uri, function(res) {
			var body = "";
			res.setEncoding('utf8');
			res.on('data', (chunk) => {
				body += chunk;
			});
			res.on('end', () => {
				try {
					res.body = JSON.parse(body);
				} catch(ex) {
					res.body = body;
				}
				resolve(res);
			});
		}).once('error', function(err) {
			reject(err);
		});
	});
};

exports.post = function(uri, data) {
	return new Promise(function(resolve, reject) {
		if (typeof uri == "string") uri = URL.parse(uri);
		uri = Object.assign({}, uri);
		uri.method = 'POST';
		var req = http.request(uri, function(res) {
			var body = "";
			res.setEncoding('utf8');
			res.on('data', (chunk) => {
				body += chunk;
			});
			res.on('end', () => {
				try {
					res.body = JSON.parse(body);
				} catch(ex) {
					res.body = body;
				}
				resolve(res);
			});
		});
		req.once('error', function(err) {
			reject(err);
		});
		if (data) req.write(data);
		req.end();
	}).catch(function(err) {
		console.error(err);
	});
};

exports.errorHandler = function(err, req, res, next) {
	if (err.statusCode == 401 || err.statusCode == 403) return res.sendStatus(err.statusCode);
	else return next(err);
};
