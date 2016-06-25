var spawn = require('child_process').spawn;
var express = require('express');
var http = require('http');
var fs = require('fs');
var URL = require('url');
var Transform = require('stream').Transform;
var util = require('util');

process.chdir(__dirname);

module.exports = function(opts) {
	var obj = {};
	if (opts.express) {
		obj.express = express();
		obj.express.server = obj.express.listen(opts.express.port);
	}
	if (opts.memcached) {
		obj.memcached = spawn('memcached', ['-v', '-p', opts.memcached.port]);
		obj.memcached.stdout.pipe(process.stdout);
		obj.memcached.stderr.pipe(process.stderr);
	}
	if (opts.nginx) {
		var conf = fs.readFileSync(opts.nginx.conf).toString();
		if (opts.memcached) conf = conf.replace(/\$memcached/g, opts.memcached.port);
		if (opts.express) conf = conf.replace(/\$express/g, opts.express.port);
		conf = conf.replace(/\$nginx/g, opts.nginx.port);

		fs.writeFileSync('./test.conf', conf);

		obj.nginx = spawn('/usr/sbin/nginx', [
			'-p', __dirname,
			'-c', './nginx.conf'
		]);
		obj.nginx.stdout.pipe(process.stdout);
		obj.nginx.stderr.pipe(new FilterNginxError()).pipe(process.stderr);
	}
	obj.close = close.bind(obj);
	return obj;
};

function close() {
	if (this.nginx) this.nginx.kill('SIGTERM');
	if (this.memcached) this.memcached.kill('SIGKILL');
	if (this.express) this.express.server.close();
}

module.exports.get = function(uri) {
	return new Promise(function(resolve, reject) {
		http.get(uri, function(res) {
			var body = "";
			res.setEncoding('utf8');
			res.on('data', (chunk) => {
				body += chunk;
			});
			res.on('end', () => {
				res.body = JSON.parse(body);
				resolve(res);
			});
		}).once('error', function(err) {
			reject(err);
		});
	});
};

module.exports.post = function(uri, data) {
	return new Promise(function(resolve, reject) {
		var uriObj = URL.parse(uri);
		uriObj.method = 'POST';
		var req = http.request(uriObj, function(res) {
			resolve(res);
		});
		req.once('error', function(err) {
			reject(err);
		});
		req.write(data);
		req.end();
	}).catch(function(err) {
		console.error(err);
	});
};

function FilterNginxError(options) {
	Transform.call(this, options);
}
util.inherits(FilterNginxError, Transform);
FilterNginxError.prototype._transform = function(chunk, enc, cb) {
	var str = chunk.toString();
	str = str.replace(/^nginx: \[alert\] could not open error log file: open.*\n/, "");
	this.push(str);
	cb();
};

