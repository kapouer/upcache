#!/usr/bin/node
const { Deferred } = require('class-deferred');
const spawn = require('child_process').spawn;
const Path = require('path');
const Transform = require('stream').Transform;

const rootDir = Path.resolve(__dirname, '..', 'nginx');

process.chdir(rootDir);

class FilterPipe extends Transform {
	constructor(matcher, grep) {
		super();
		this.matcher = matcher;
		this.grep = grep ? new RegExp(grep, 'i') : null;
	}
	_transform(chunk, enc, cb) {
		const lines = [];
		chunk.toString().split('\n').forEach(str => {
			str = this.matcher(str);
			if (this.grep) {
				if (this.grep.test(str)) lines.push(str);
			} else if (str) {
				lines.push(str);
			}
		});
		if (lines.length) lines.push('');
		this.push(lines.join('\n'));
		cb();
	}
}

module.exports = async function(opts) {
	const obj = {};
	obj.close = close.bind(obj);
	const defer = new Deferred();
	process.on('exit', obj.close);
	if (opts.memc) {
		obj.memcached = spawn('memcached', ['-vv', '-p', opts.memc, '-I', '10m']);
		obj.memcached.stdout.pipe(process.stdout);
		obj.memcached.stderr.pipe(new FilterPipe(((str) => {
			if (/^<\d+\s[sg]et\s.*$/mig.test(str)) return "[memc] " + str.substring(4);
		}), opts.grep)).pipe(process.stderr);
		obj.memcached.on('error', obj.close);
	}
	if (opts.ngx) {
		obj.nginx = spawn('/usr/sbin/nginx', [
			'-p', rootDir,
			'-c', 'nginx.conf'
		]);
		obj.nginx.stdout.pipe(process.stdout);
		obj.nginx.stderr.pipe(new FilterPipe(((str) => {
			if (/start worker process /.test(str) && !obj.nginx.started) {
				obj.nginx.started = true;
				defer.resolve(obj);
			}
			str = str.replace(/^nginx: \[alert\] could not open error log file: open.*/, "");
			str = str.replace(/^.*(\[\w+\]).*?:(.*)$/, (str, p1, p2) => {
				if (p1 == "[notice]") return "";
				return p1 + p2;
			});
			str = str.replace(/^\[lua\][\d):]*\s/, "[lua]  ");
			return str;
		}), opts.grep)).pipe(process.stderr);
		obj.nginx.on('error', obj.close);
	} else defer.resolve(obj);
	return defer;
};

function close() {
	let count = 0;
	const defer = new Deferred();
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
		if (--count) defer.resolve();
	}
	return defer;
}


