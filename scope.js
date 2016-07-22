var jwt = require('jsonwebtoken');
var cookie = require('cookie');
var debug = require('debug')('scope');

var jwtAlgorithm = 'RS256';

var headerRestriction = 'X-Cache-Restriction';
var headerHandshake = 'X-Cache-Key-Handshake';

var publicKeySent = false;

var config;
exports = module.exports = function(obj) {
	config = Object.assign({}, obj);
	return exports;
};

// facility for checking request against some scopes
exports.allowed = function(req) {
	var action = getAction(method);
	var list = restrictionsByAction(action, Array.from(arguments).slice(1));
	sendHeaders(req.res, list);
	return authorize(action, list, initScopes(req));
};

function restrictionsByAction(action, list) {
	if (!action) return [];
	if (!Array.isArray(list)) list = [list];
	var metaAction = action == "read" ? "read" : "write";
	var restrictions = [];
	list.forEach(function(item) {
		if (typeof item != "string") {
			if (item[action]) item = item[action];
			else if (item[metaAction]) item = item[metaAction];
			else return;
		}
		restrictions.push(item);
	});
	return restrictions;
}

function authorize(action, restrictions, scopes) {
	if (!action) return false;
	var failure = false;
	var i, label, grant, scope, mandatory, regstr;
	var grants = [];
	for (i=0; i < restrictions.length; i++) {
		grant = label = restrictions[i];
		if (label == "*") {
			grants.push(grant);
			continue;
		}
		if (!scopes) continue;
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
				grants.push(grant);
				continue;
			}
		} else {
			scope = scopes[label];
			if (scope === true || scope && scope[action]) {
				grants.push(grant);
				continue;
			}
		}
		if (mandatory) {
			failure = true;
			break;
		}
	}
	if (failure || !grants.length) return false;
	// might be useful for optimizing first proxy response key
	// by sending actual scopes being granted, since the response key
	// will do the same job, given request bearer and restrictions list
	return grants;
}

function sendHeaders(res, list) {
	// an empty list does not have same meaning as no list at all
	if (list) {
		res.set(headerRestriction, list);
		debug("send header", headerRestriction, list);
	} else {
		debug("not sending header", headerRestriction);
	}
};

exports.reject = function(res) {
	res.sendStatus(403);
};

exports.restrict = function() {
	var restrictions = Array.from(arguments);
	// TODO memoize restrictionsByAction
	return function(req, res, next) {
		if (req.get(headerHandshake) == '1' || !publicKeySent) {
			debug("sending public key to proxy");
			publicKeySent = true;
			res.set(headerHandshake, encodeURIComponent(config.publicKey));
		}
		var scopes = initScopes(req);
		var action = getAction(req.method);
		var list = restrictionsByAction(action, restrictions);
		sendHeaders(res, list);
		var grants = authorize(action, list, scopes);
		if (grants) {
			debug("grants", grants);
			next();
		} else if (!scopes) {
			res.sendStatus(401);
		} else {
			res.sendStatus(403);
		}
	};
};

// scopes: array of permissions strings
exports.login = function(res, scopes) {
	var obj = {
		iat: Math.floor(Date.now() / 1000),
		scopes: normalizeScopes(scopes)
	};
	obj.exp = obj.iat + config.maxAge;

	var bearer = jwt.sign(obj, config.privateKey, {
		algorithm: jwtAlgorithm,
		issuer: config.issuer
	});
	res.cookie('bearer', bearer, {
		maxAge: config.maxAge * 1000,
		httpOnly: true,
		path: '/'
	});
	return bearer;
};

exports.logout = function(res) {
	res.clearCookie('bearer', {
		httpOnly: true,
		path: '/'
	});
	res.sendStatus(204);
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

function initScopes(req) {
	if (req.scopes) return req.scopes;
	if (!req.cookies) req.cookies = cookie.parse(req.headers.cookie || "") || {};

	var bearer = req.cookies.bearer;
	if (!bearer) {
		delete req.scopes;
		return;
	}
	var obj;
	try {
		obj = jwt.verify(bearer, config.publicKey, {
			algorithm: jwtAlgorithm,
			issuer: config.issuer
		});
	} catch(ex) {
		debug(ex, bearer);
	}
	req.scopes = obj && obj.scopes || {};
	return req.scopes;
}

function normalizeScopes(scopes) {
	if (!Array.isArray(scopes)) return scopes;
	var obj = {};
	scopes.forEach(function(item) {
		obj[item] = true;
	});
	return obj;

}
