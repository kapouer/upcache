const debug = require('debug')('upcache:lock');

const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const HttpError = require('http-errors');

const common = require('./common');

class Lock {
	static headerKey = common.prefixHeader + '-Lock-Key';
	static headerVar = common.prefixHeader + '-Lock-Var';
	static headerLock = common.prefixHeader + '-Lock';

	constructor(obj) {
		this.publicKeySent = false;
		this.config = Object.assign({
			algorithm: 'RS256',
			varname: 'cookie_bearer',
			userProperty: 'user',
			issuerProperty: 'hostname'
		}, obj);
		this.init = this.init.bind(this);
		this.handshake = this.handshake.bind(this);
		this.vary = this.vary.bind(this);

		const varname = this.config.varname;
		if (varname.startsWith('cookie_')) {
			this.cookieName = varname.substring(7);
		} else if (varname.startsWith('http_')) {
			this.headerName = varname.substring(5).replace(/_/g, '-');
		}
	}

	vary() {
		let list = Array.from(arguments);
		if (list.length == 1 && Array.isArray(list[0])) list = list[0];
		return function (req, res, next) {
			this.handshake(req, res);
			this.parse(req);
			this.headers(res, list);
			next();
		}.bind(this);
	}
	headers(res, list) {
		if (list == null) {
			list = [];
		} else if (typeof list == "string") {
			list = [list];
		} else if (typeof list == "object" && !Array.isArray(list)) {
			list = Object.keys(list);
		}
		let cur = res.get(Lock.headerLock);
		if (cur) {
			cur = cur.split(/,\s?/);
		} else {
			cur = [];
		}
		for (const str of list) {
			if (cur.includes(str) == false) cur.push(str);
		}
		if (cur.length > 0) {
			res.set(Lock.headerLock, cur.join(', '));
			debug("send header", Lock.headerLock, cur);
		}
	}

	handshake(req, res, next) {
		if (req.get(Lock.headerKey) == '1' || !this.handshaked) {
			debug("sending public key to proxy");
			this.handshaked = true;
			if (this.config.bearer) res.set(Lock.headerVar, this.config.bearer);
			res.set(Lock.headerKey, encodeURIComponent(this.config.publicKey));
		}
		if (next) next();
	}

	restrict() {
		const locks = Array.from(arguments);
		return (req, res, next) => {
			this.handshake(req, res);
			this.headers(res, locks);
			const user = this.parse(req);

			const locked = !user.grants || !locks.some(lock => {
				if (lock.includes('*')) {
					const reg = new RegExp('^' + lock.replace(/\*/g, '.*') + '$');
					return user.grants.some((grant) => {
						return reg.test(grant);
					});
				} else if (lock.includes(':')) {
					let found = false;
					lock.replace(/:(\w+)/, (m, p) => {
						if (user[p] !== undefined) {
							found = true;
						}
					});
					return found;
				} else {
					return user.grants.includes(lock);
				}
			});
			let err;
			if (!locked) {
				debug("unlocked");
			} else if (!user.grants) {
				err = new HttpError.Unauthorized("No user grants");
			} else {
				err = new HttpError.Forbidden("No allowed user grants");
			}
			next(err);
		};
	}

	sign(user, opts) {
		if (!user.grants) debug("login user without grants");
		opts = Object.assign({}, this.config, opts);
		if (opts.maxAge && typeof opts.maxAge != 'number') {
			console.warn("upcache/scope.login: maxAge must be a number in seconds");
		}
		if (!opts.issuer) throw new Error("Missing issuer");
		return jwt.sign(user, opts.privateKey, {
			expiresIn: opts.maxAge,
			algorithm: opts.algorithm,
			issuer: opts.issuer
		});
	}

	login(res, user, opts) {
		opts = Object.assign({}, this.config, opts);
		const { userProperty, issuerProperty } = opts;
		const { req } = res;
		opts.issuer = req[issuerProperty];
		const bearer = this.sign(user, opts);
		if (userProperty && req[userProperty]) {
			req[userProperty].grants = user.grants;
		}
		if (this.cookieName) {
			res.cookie(this.cookieName, bearer, {
				maxAge: opts.maxAge * 1000,
				httpOnly: true,
				secure: res.req.secure,
				path: '/'
			});
		} else if (this.headerName) {
			res.set(this.headerName, bearer);
		}
		return bearer;
	}

	logout(res) {
		if (this.cookieName) res.clearCookie(this.cookieName, {
			httpOnly: true,
			path: '/'
		});
	}

	init(req, res, next) {
		this.handshake(req, res);
		this.parse(req);
		next();
	}

	parse(req) {
		const { config } = this;
		const { userProperty, issuerProperty } = config;
		if (userProperty && req[userProperty]) return req[userProperty];
		let bearer;
		let obj;
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
					issuer: req[issuerProperty]
				});
			} catch (ex) {
				debug(ex, bearer);
			}
		}
		if (!obj) obj = {};
		debug(`set req.${userProperty}`, obj);
		req[userProperty] = obj;
		return obj;
	}
}

module.exports = function (obj) {
	return new Lock(obj);
};

