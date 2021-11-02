const http = require('http');
const URL = require('url');

exports.get = function(uri) {
	return new Promise((resolve, reject) => {
		if (typeof uri == "string") uri = URL.parse(uri);
		uri = Object.assign({}, uri);
		http.get(uri, (res) => {
			let body = "";
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
		}).once('error', (err) => {
			reject(err);
		});
	});
};

exports.post = function(uri, data) {
	return new Promise((resolve, reject) => {
		if (typeof uri == "string") uri = URL.parse(uri);
		uri = Object.assign({}, uri);
		uri.method = 'POST';
		const req = http.request(uri, (res) => {
			let body = "";
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
		req.once('error', (err) => {
			reject(err);
		});
		if (data) req.write(data);
		req.end();
	}).catch((err) => {
		console.error(err);
	});
};

exports.errorHandler = function(err, req, res, next) {
	if (err.statusCode == 401 || err.statusCode == 403) return res.sendStatus(err.statusCode);
	else return next(err);
};
