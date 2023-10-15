const debug = require('debug')('upcache:tag');

const ctrl = {};
require('@kapouer/express-cache-response-directive')()(null, ctrl, () => {});

const common = require('./common');

const headerTag = common.prefixHeader + '-Tag';

module.exports = tagFn;

function forFn(opts) {
	if (typeof opts == "string") opts = {
		maxAge: opts
	};
	return function (req, res, next) {
		const header = res.getHeader('cache-control') ?? [];
		const list = Array.isArray(header) ? header : header.split(', ');
		if (!list.includes('no-cache')) {
			ctrl.cacheControl.call(res, opts);
		}
		next();
	};
}

tagFn.for = forFn;

tagFn.disable = function () {
	function disableMw(req, res, next) {
		ctrl.cacheControl.call(res, {
			noCache: true,
			mustRevalidate: true,
			proxyRevalidate: true
		});
		next();
	}
	disableMw.for = function () {
		return function (req, res, next) {
			next();
		};
	};
	return disableMw;
};

class TagMw {
	constructor(tags) {
		this.tags = tags;
		const len = tags.length;
		if (len && typeof tags[len - 1] == "function") {
			this.inc = tags.pop();
		} else {
			this.inc = function(req) {
				return req.method != "GET";
			};
		}
		this.mw = this.mw.bind(this);
		this.mw.for = this.for.bind(this);
	}

	mw(req, res, next) {
		// prevent conditional requests if proxy is caching
		// it would have been done in the proxy, after a cache miss, if
		// current proxy allowed that easily
		if (req.get(common.prefixHeader)) {
			// TODO deal with If-Match, In-Unmodified-Since, If-Range
			delete req.headers["if-none-match"];
			delete req.headers["if-modified-since"];
		}
		const inc = this.inc(req);
		let list = res.get(headerTag);
		if (list) {
			list = list.split(',').map(str => str.trim());
		} else {
			list = [];
		}
		this.hasTags = false;
		for (let tag of this.tags) {
			tag = replacements(tag, req);
			if (tag == null) continue;
			let incTag = inc;
			let itag;
			if (tag.startsWith('+')) {
				incTag = true;
				itag = tag;
				tag = tag.slice(1);
			} else {
				itag = '+' + tag;
			}
			let cur = list.indexOf(tag);
			if (cur < 0) {
				cur = list.indexOf(itag);
			} else if (incTag) {
				list[cur] = itag;
				continue;
			}
			if (cur < 0) {
				list.push(incTag ? itag : tag);
				this.hasTags = true;
			}
		}
		if (this.hasTags) { // else it did not change
			res.set(headerTag, list.join(', '));
		}

		debug("response tags", list);
		if (next) next();
	}

	for(ttl) {
		return (req, res, next) => {
			this.mw(req, res, (err) => {
				if (err) return next(err);
				if (this.hasTags) forFn(ttl)(req, res, next);
				else next();
			});
		};
	}
}

function tagFn() {
	return new TagMw(Array.from(arguments)).mw;
}


function replacements(tag, req) {
	let someNull = false;
	const str = tag.replace(/:(\w+)/g, (str, name) => {
		const val = name in req.params ? req.params[name] : req.res.locals[name];
		if (val == null) {
			someNull = true;
		} else {
			return val;
		}
	});
	if (!someNull) return str;
	else return null;
}
