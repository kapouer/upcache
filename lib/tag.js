const debug = require('debug')('upcache:tag');

const ctrl = {};
require('express-cache-response-directive')()(null, ctrl, () => {});

const common = require('./common');

const headerTag = common.prefixHeader + '-Tag';

module.exports = tagFn;

function forFn(opts) {
	if (typeof opts == "string") opts = {
		maxAge: opts
	};
	return function(req, res, next) {
		ctrl.cacheControl.call(res, opts);
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

function tagFn() {
	const tags = Array.from(arguments);
	const len = tags.length;
	let incFn;
	if (len && typeof tags[len - 1] == "function") {
		incFn = tags.pop();
	} else {
		incFn = function(req) {
			return req.method != "GET";
		};
	}

	function tagMw(req, res, next) {
		// prevent conditional requests if proxy is caching
		// it would have been done in the proxy, after a cache miss, if
		// current proxy allowed that easily
		if (req.get(common.prefixHeader)) {
			// TODO deal with If-Match, In-Unmodified-Since, If-Range
			delete req.headers["if-none-match"];
			delete req.headers["if-modified-since"];
		}
		const inc = incFn(req);
		let list = res.get(headerTag);
		if (list) list = list.split(',').map((str) => {
			return str.trim();
		});
		else list = [];
		tags.forEach((tag) => {
			tag = common.replacements(tag, req.params);
			if (tag == null) return;
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
				return;
			}
			if (cur < 0) list.push(incTag ? itag : tag);
		});
		if (list.length > 0) res.set(headerTag, list.join(', '));
		else res.set(headerTag);

		debug("response tags", list);
		if (next) next();
	}

	tagMw.for = function(ttl) {
		return function(req, res, next) {
			tagMw(req, res, (err) => {
				if (err) return next(err);
				if (res.get(headerTag)) forFn(ttl)(req, res, next);
				else next();
			});
		};
	};
	return tagMw;
}

