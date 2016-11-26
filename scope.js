var debug = require('debug')('upcache:scope');

var jwt = require('jsonwebtoken');
var cookie = require('cookie');
var HttpError = require('http-errors');

var common = require('./common');

module.exports = function(obj) {
	return new Scope(obj);
};

function Scope(obj) {
	this.publicKeySent = false;
	this.config = Object.assign({
		algorithm: 'RS256',
		forbidden: 403,
		unauthorized: 401
	}, obj);
}

Scope.headerHandshake = common.prefixHeader + '-Key-Handshake';
Scope.headerScope = common.prefixHeader + '-Scope';

// facility for checking request against some scopes
Scope.prototype.allowed = function(req) {
	var action = getAction(method);
	var list = restrictionsByAction(action, Array.from(arguments).slice(1));
	if (list) list = list.map(function(r) {
		return common.replacements(r, req.params);
	});
	sendHeaders(req.res, list);
	return authorize(action, list, this.parseBearer(req));
};

function restrictionsByAction(action, list) {
	if (!action) return [];
	if (!Array.isArray(list)) list = [list];
	var metaAction = action == "read" ? "read" : "write";
	var i, item, hash = {};
	for (i=0; i < list.length; i++) {
		item = list[i];
		if (typeof item == "object") {
			if (item[action]) item = item[action];
			else if (item[metaAction]) item = item[metaAction];
			else continue;
		}
		if (item === true) return; // return nothing - an empty list would deny access
		hash[item] = true;
	}
	return Object.keys(hash);
}

function authorize(action, restrictions, user) {
	if (!action) return false;
	if (!restrictions) return true;
	var scopes = user && user.scopes;
	if (!scopes) scopes = {"": true};
	var failure = false;
	var i, label, grant, scope, mandatory, regstr;
	var grants = {};
	for (i=0; i < restrictions.length; i++) {
		grant = label = restrictions[i];
		mandatory = false;
		if (label[0] == "&") {
			mandatory = true;
			label = label.substring(1);
		}
		regstr = label.replace(/\*/g, '.*');
		if (regstr.length != label.length) {
			// wildcard
			var reg = new RegExp("^" + regstr + "$");
			if (Object.keys(scopes).some(function(scope) {
				var scopeObj = scopes[scope];
				if (scopeObj == true || scopeObj != null && scopeObj[action] == true) {
					return reg.test(scope);
				}
			})) {
				grants[grant] = true;
				continue;
			}
		} else {
			scope = scopes[label];
			if (scope === true || scope && scope[action]) {
				grants[grant] = true;
				continue;
			}
		}
		if (mandatory) {
			failure = true;
			break;
		}
	}
	grants = Object.keys(grants);
	if (failure || !grants.length) return false;
	// might be useful for optimizing first proxy response key
	// by sending actual scopes being granted, since the response key
	// will do the same job, given request bearer and restrictions list
	return grants;
}

function sendHeaders(res, list) {
	// an empty list does not have same meaning as no list at all
	if (list) {
		res.set(Scope.headerScope, list);
		debug("send header", Scope.headerScope, list);
	} else {
		debug("not sending header", Scope.headerScope);
	}
};

Scope.prototype.restrict = function() {
	var restrictions = Array.from(arguments);
	var config = this.config;
	var self = this;
	// TODO memoize restrictionsByAction
	return function(req, res, next) {
		var user = self.parseBearer(req);
		var action = getAction(req.method);
		if (req.get(Scope.headerHandshake) == '1' || !self.publicKeySent) {
			debug("sending public key to proxy");
			self.publicKeySent = true;
			res.set(Scope.headerHandshake, encodeURIComponent(config.publicKey));
		}
		var list = restrictionsByAction(action, restrictions);
		if (list) list = list.map(function(r) {
			return common.replacements(r, req.params);
		});
		sendHeaders(res, list);
		var grants = authorize(action, list, user);
		var err;
		if (grants) {
			debug("grants", grants);
		} else if (!user || !user.scopes) {
			err = new HttpError.Unauthorized("No user, or no user scopes");
		} else {
			err = new HttpError.Forbidden("No matching user scope found");
		}
		next(err);
	};
};

Scope.prototype.sign = function(user, opts) {
	if (!user.scopes) debug("login user without scopes");
	opts = Object.assign({}, this.config, opts);
	return jwt.sign(user, opts.privateKey, {
		expiresIn: opts.maxAge,
		algorithm: opts.algorithm,
		issuer: opts.issuer
	});
};

Scope.prototype.login = function(res, user, opts) {
	var bearer = this.sign(user, opts);
	if (res) res.cookie('bearer', bearer, {
		maxAge: opts.maxAge * 1000,
		httpOnly: true,
		path: '/'
	});
	return bearer;
};

Scope.prototype.logout = function(res) {
	res.clearCookie('bearer', {
		httpOnly: true,
		path: '/'
	});
};

function getAction(method) {
	return {
		GET: "read",
		HEAD: "read",
		PUT: "save",
		PATCH: "save",
		POST: "add",
		DELETE: "del"
	}[method];
}

Scope.prototype.parseBearer = function(req) {
	var config = this.config;
	var prop = config.userProperty;
	if (prop && req[prop]) return req[prop];
	if (!req.cookies) req.cookies = cookie.parse(req.headers.cookie || "") || {};

	var bearer = req.cookies.bearer;
	if (!bearer) {
		return;
	}
	var obj;
	try {
		obj = jwt.verify(bearer, config.publicKey, {
			algorithm: config.algorithm,
			issuer: config.issuer
		});
	} catch(ex) {
		debug(ex, bearer);
	}
	if (!obj) return;
	if (prop) req[prop] = obj;
	return obj;
};

