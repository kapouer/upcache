#!/usr/bin/node

var spawn = require('child_process').spawn;
var http = require('http');
var fs = require('fs');
var Path = require('path');
var URL = require('url');
var Transform = require('stream').Transform;
var util = require('util');

var rootDir = Path.resolve(__dirname, 'nginx');

process.chdir(rootDir);

module.exports = function(opts, cb) {
	var obj = {};
	obj.close = close.bind(obj);
	process.on('exit', obj.close);
	if (opts.memc) {
		obj.memcached = spawn('memcached', ['-vv', '-p', opts.memc, '-I', '10m']);
		obj.memcached.stdout.pipe(process.stdout);
		obj.memcached.stderr.pipe(new FilterPipe(function(str) {
			if (/^\<\d+\s[sg]et\s.*$/mig.test(str)) return "[memc] " + str.substring(4);
		}, opts.grep)).pipe(process.stderr);
		obj.memcached.on('error', obj.close);
	}
	if (opts.ngx) {
		obj.nginx = spawn('/usr/sbin/nginx', [
			'-p', rootDir,
			'-c', 'nginx.conf'
		]);
		obj.nginx.stdout.pipe(process.stdout);
		obj.nginx.stderr.pipe(new FilterPipe(function(str) {
			if (/start worker process /.test(str) && !obj.nginx.started) {
				obj.nginx.started = true;
				setImmediate(cb);
			}
			str = str.replace(/^nginx: \[alert\] could not open error log file: open.*/, "");
			str = str.replace(/^.*(\[\w+\]).*?:(.*)$/, function(str, p1, p2) {
				if (p1 == "[notice]") return "";
				return p1 + p2;
			});
			str = str.replace(/^\[lua\][\d\):]*\s/, "[lua]  ");
			return str;
		}, opts.grep)).pipe(process.stderr);
		obj.nginx.on('error', obj.close);
	} else setImmediate(cb);
	return obj;
};

function close(cb) {
	var count = 0;
	if (this.nginx) {
		count++;
		this.nginx.on('exit', done);
		this.nginx.kill('SIGTERM');
		delete this.nginx;
	}
	if (this.memcached) {
		count++;
		this.memcached.on('exit', done);
		this.memcached.kill('SIGKILL');
		delete this.memcached;
	}
	function done() {
		if (--count) cb();
	}
}

module.exports.get = function(uri) {
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

module.exports.post = function(uri, data) {
	return new Promise(function(resolve, reject) {
		if (typeof uri == "string") uri = URL.parse(uri);
		uri = Object.assign({}, uri);
		uri.method = 'POST';
		var req = http.request(uri, function(res) {
			resolve(res);
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

module.exports.errorHandler = function(err, req, res, next) {
	if (err.statusCode == 401 || err.statusCode == 403) return res.sendStatus(err.statusCode);
	else return next(err);
};

function FilterPipe(matcher, grep) {
	Transform.call(this);
	this.matcher = matcher;
	this.grep = grep ? new RegExp(grep, 'i') : null;
}
util.inherits(FilterPipe, Transform);
FilterPipe.prototype._transform = function(chunk, enc, cb) {
	var lines = [];
	chunk.toString().split('\n').forEach(function(str) {
		str = this.matcher(str);
		if (this.grep) {
			if (this.grep.test(str)) lines.push(str);
		} else if (str) {
			lines.push(str);
		}
	}.bind(this));
	if (lines.length) lines.push('');
	this.push(lines.join('\n'));
	cb();
};

