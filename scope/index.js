var jwt = require('jsonwebtoken');
var cookie = require('cookie');
var debug = require('debug')('scope');

var jwtAlgorithm = 'RS256';

var config;
exports = module.exports = function(obj) {
	config = obj;
	return exports;
};

// facility for checking request against a single scope
exports.allowed = function(req, restriction) {
	if (!Array.isArray(restriction)) restriction = [restriction];
	return authorize(req.method, restriction, initScopes(req));
};

function authorize(method, restrictions, scopes) {
	var action = getAction(method);
	if (!action) return false;
	var metaaction = action == "read" ? "read" : "write";

	var mandatoryFailure = false;

	var hadValid = restrictions.some(function(restriction) {
		if (typeof restriction != "string") {
			if (restriction[action]) restriction = restriction[action];
			else if (restriction[metaaction]) restriction = restriction[metaaction];
			if (restriction === true) return true;
			if (restriction === false) return false;
		}
		if (!scopes) return false;
		var mandatory = false;
		if (restriction[0] == "&") {
			mandatory = true;
			restriction = restriction.substring(1);
		}
		var scope = scopes[restriction];
		if (scope === true) return true;
		if (scope && scope[action]) return true;
		if (mandatory) {
			mandatoryFailure = true;
			return true;
		}
	});
	return hadValid && !mandatoryFailure;
}

exports.grant = function(res, restrictions) {
	if (restrictions.length) res.set('X-Cache-Restriction', restrictions.join(','));
};

exports.reject = function(res) {
	res.sendStatus(403);
};

exports.restrict = function() {
	var restrictions = Array.from(arguments);
	return function(req, res, next) {
		var scopes = initScopes(req);
		if (authorize(req.method, restrictions, scopes)) {
			exports.grant(res, restrictions);
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
		debug(ex);
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
