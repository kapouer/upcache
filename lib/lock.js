var debug = require('debug')('upcache:lock');

var jwt = require('jsonwebtoken');
var cookie = require('cookie');
var HttpError = require('http-errors');

var common = require('./common');

module.exports = function(obj) {
	return new Lock(obj);
};

function Lock(obj) {
	this.publicKeySent = false;
	this.config = Object.assign({
		algorithm: 'RS256',
		varname: 'cookie_bearer'
	}, obj);
	this.init = this.init.bind(this);
	this.handshake = this.handshake.bind(this);
	this.vary = this.vary.bind(this);

	var varname = this.config.varname;
	if (varname.startsWith('cookie_')) {
		this.cookieName = varname.substring(7);
	} else if (varname.startsWith('http_')) {
		this.headerName = varname.substring(5).replace(/_/g, '-');
	}
}

Lock.headerKey = common.prefixHeader + '-Lock-Key';
Lock.headerVar = common.prefixHeader + '-Lock-Var';
Lock.headerLock = common.prefixHeader + '-Lock';

Lock.prototype.vary = function(list) {
	return function(req, res, next) {
		this.handshake(req, res);
		this.parse(req);
		this.headers(res, list);
		next();
	}.bind(this);
};

Lock.prototype.headers = function(res, list) {
	if (list == null) list = [];
	else if (typeof list == "string") list = [list];
	else if (typeof list == "object" && !Array.isArray(list)) list = Object.keys(list);
	var cur = res.get(Lock.headerLock);
	if (cur) cur = cur.split(',').map(function(str) {
		return str.trim();
	});
	else cur = [];
	list.forEach(function(str) {
		str = str.trim();
		if (str && cur.includes(str) == false) cur.push(str);
	});
	res.set(Lock.headerLock, cur.join(', '));
	debug("send header", Lock.headerLock, list);
};

Lock.prototype.handshake = function(req, res, next) {
	if (req.get(Lock.headerKey) == '1' || !this.handshaked) {
		debug("sending public key to proxy");
		this.handshaked = true;
		if (this.config.bearer) res.set(Lock.headerVar, this.config.bearer);
		res.set(Lock.headerKey, encodeURIComponent(this.config.publicKey));
	}
	if (next) next();
};

Lock.prototype.restrict = function() {
	var locks = Array.from(arguments);
	return function(req, res, next) {
		this.handshake(req, res);
		this.headers(res, locks);
		var user = this.parse(req);

		var locked = !user.grants || !locks.some(function(lock) {
			if (lock.includes('*')) {
				var reg = new RegExp('^' + lock.replace(/\*/g, '.*') + '$');
				return user.grants.some(function(grant) {
					return reg.test(grant);
				});
			} else if (lock.includes(':')) {
				var found = false;
				lock.replace(/:(\w+)/, function(m, p) {
					if (user[p] !== undefined) {
						found = true;
					}
				});
				return found;
			} else {
				return user.grants.includes(lock);
			}
		});
		var err;
		if (!locked) {
			debug("unlocked");
		} else if (!user.grants) {
			err = new HttpError.Unauthorized("No user grants");
		} else {
			err = new HttpError.Forbidden("No allowed user grants");
		}
		next(err);
	}.bind(this);
};

Lock.prototype.sign = function(user, opts) {
	if (!user.scopes) debug("login user without scopes");
	opts = Object.assign({}, this.config, opts);
	if (opts.maxAge && typeof opts.maxAge != 'number') {
		console.warn("upcache/scope.login: maxAge must be a number in seconds");
	}
	if (!opts.hostname) throw new Error("Missing hostname");
	return jwt.sign(user, opts.privateKey, {
		expiresIn: opts.maxAge,
		algorithm: opts.algorithm,
		issuer: opts.hostname
	});
};

Lock.prototype.login = function(res, user, opts) {
	opts = Object.assign({}, this.config, opts);
	opts.hostname = res.req.hostname;
	var bearer = this.sign(user, opts);
	if (this.cookieName) {
		res.cookie(this.cookieName, bearer, {
			maxAge: opts.maxAge * 1000,
			httpOnly: true,
			path: '/'
		});
	} else if (this.headerName) {
		res.set(this.headerName, bearer);
	}
	return bearer;
};

Lock.prototype.logout = function(res) {
	if (this.cookieName) res.clearCookie(this.cookieName, {
		httpOnly: true,
		path: '/'
	});
};

Lock.prototype.init = function(req, res, next) {
	this.handshake(req, res);
	this.parse(req);
	next();
};

Lock.prototype.parse = function(req) {
	var config = this.config;
	var prop = config.userProperty;
	if (prop && req[prop]) return req[prop];
	var bearer;
	var obj;
	if (this.cookieName) {
		if (!req.cookies) req.cookies = cookie.parse(req.headers.cookie || "") || {};
		bearer = req.cookies[this.cookieName];
	} else if (this.headerName) {
		bearer = req.get(this.headerName);
	}

	if (bearer) {
		try {
			obj = jwt.verify(bearer, config.publicKey, {
				algorithm: config.algorithm,
				issuer: req.hostname
			});
		} catch(ex) {
			debug(ex, bearer);
		}
	}
	if (!obj) obj = {};
	debug(`set req.${prop}`, obj);
	req[prop] = obj;
	return obj;
};

