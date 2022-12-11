const http = require('http');
const URL = require('url');
const { Deferred } = require('class-deferred');

exports.get = function (uri) {
	const defer = new Deferred();
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
			defer.resolve(res);
		});
	}).once('error', (err) => {
		defer.reject(err);
	});
	return defer;
};

exports.post = function(uri, data) {
	const defer = new Deferred();
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
			defer.resolve(res);
		});
	});
	req.once('error', (err) => {
		defer.reject(err);
	});
	if (data) req.write(data);
	req.end();
	return defer;
};

exports.errorHandler = function(err, req, res, next) {
	if (err.statusCode == 401 || err.statusCode == 403) return res.sendStatus(err.statusCode);
	else return next(err);
};
