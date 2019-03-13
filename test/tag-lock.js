var debug = require('debug')('full');
var should = require('should');
var fs = require('fs');
var Path = require('path');
var URL = require('url');
var cookie = require('cookie');
var express = require('express');

var runner = require('../lib/spawner');
var common = require('./common');

var upcache = require('..');
var locker = upcache.lock({
	privateKey: fs.readFileSync(Path.join(__dirname, 'fixtures/private.pem')).toString(),
	publicKey: fs.readFileSync(Path.join(__dirname, 'fixtures/public.pem')).toString(),
	maxAge: 3600,
	issuer: "test",
	userProperty: "user"
});
var tag = upcache.tag;

var ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Tag and Lock", function suite() {
	var servers, app;
	var testPath = '/full-scope-test';
	var testPathTag = '/full-scope-tag-test';
	var testPathNotGranted = '/full-scope-not-granted-test';
	var scopeDependentTag = '/scope-dependent-tag';
	var testPathDynamic = '/dynamic';
	var counters = {};

	function count(uri, inc) {
		if (typeof uri != "string") {
			if (uri.get) uri = uri.protocol + '://' + uri.get('Host') + uri.path;
			else uri = URL.format(Object.assign({
				protocol: 'http',
				hostname: 'localhost',
				pathname: uri.path
			}, uri));
		}
		var counter = counters[uri];
		if (counter == null) counter = counters[uri] = 0;
		if (inc) counters[uri] += inc;
		return counters[uri];
	}

	before(function(done) {
		servers = runner(ports, done);

		app = express();
		app.server = app.listen(ports.app);

		app.post('/login', function(req, res, next) {
			var givemeScope = req.query.scope;
			if (givemeScope && !Array.isArray(givemeScope)) givemeScope = [givemeScope];
			var bearer = locker.login(res, {
				id: req.query && req.query.id || 44,
				grants: givemeScope || ['bookWriter', 'bookReader']
			});
			res.send({
				bearer: bearer // convenient but not technically needed
			});
		});

		app.post('/logout', function(req, res, next) {
			locker.logout(res);
			res.sendStatus(204);
		});

		app.get('/', function(req, res, next) {
			res.send(req.get('x-upcache') ? "ok" : "not ok");
		});

		app.get(testPath, tag('test'), locker.restrict('bookReader', 'bookSecond'), function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.post(testPath, function(req, res, next) {
			res.sendStatus(204);
		});

		app.get(testPathTag, tag("full"), locker.restrict('bookReader', 'bookSecond'), function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.post(testPathTag, tag("full"), function(req, res, next) {
			res.sendStatus(204);
		});

		app.get(testPathNotGranted, tag("apart"), locker.restrict('bookReaderWhat'), function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(scopeDependentTag, locker.restrict('user-:id'), function userTag(req, res, next) {
			tag('usertag' + req.user.id)(req, res, next);
		}, function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});
		app.post(scopeDependentTag, tag("usertag18"), function(req, res, next) {
			res.sendStatus(200);
		});

		app.get(testPathDynamic, locker.init, tag('test'), function(req, res, next) {
			count(req, 1);

			var grants = req.user.grants || [];
			var locks = ['dynA', 'dynB'];
			locker.headers(res, locks);

			res.send({
				value: (req.path || '/').substring(1),
				date: new Date(),
				usergrants: grants
			});
		});

		app.use(common.errorHandler);
	});

	after(function(done) {
		app.server.close();
		servers.close(done);
	});

	beforeEach(function() {
		counters = {};
	});

	it("should set X-Upcache version in request header", function() {
		return common.get({
			port: ports.ngx,
			path: '/'
		}).then(function(res) {
			should(res.body).be.equal('ok');
		});
	});

	it("should get 401 when accessing a protected url with proxy", function() {
		var req = {
			port: ports.ngx,
			path: testPath
		};
		return common.get(req).then(function(res) {
			res.statusCode.should.equal(401);
			count(req).should.equal(0);
		});
	});

	it("should log in and get read access to a url and hit the cache with proxy", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testPath
		};
		return common.get(req).then(function(res) {
			res.headers.should.have.property('x-upcache-lock', 'bookReader, bookSecond');
			res.statusCode.should.equal(401);
			count(req).should.equal(0);
		}).then(function() {
			return common.post({
				port: ports.ngx,
				path: '/login'
			});
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return common.get(req);
		}).then(function(res) {
			res.headers.should.have.property('x-upcache-lock', 'bookReader, bookSecond');
			res.statusCode.should.equal(200);
			count(req).should.equal(1);
			return common.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			// because it should be a cache hit
			count(req).should.equal(1);
		});
	});

	it("should log in and not get read access to another url with proxy", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testPathNotGranted
		};
		return common.post({
			port: ports.ngx,
			path: '/login'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return common.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(403);
			count(req).should.equal(0);
		});
	});

	it("should log in, access, then log out, and be denied access with proxy", function() {
		var headers = {};
		return common.post({
			port: ports.ngx,
			path: '/login'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return common.get({
				headers: headers,
				port: ports.ngx,
				path: testPath
			});
		}).then(function(res) {
			res.statusCode.should.equal(200);
			return common.post({
				headers: headers,
				port: ports.ngx,
				path: "/logout"
			});
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return common.get({
				headers: headers,
				port: ports.ngx,
				path: testPath
			});
		}).then(function(res) {
			res.statusCode.should.equal(401);
		});
	});

	it("should log in with different scopes and cache each variant with proxy", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testPath
		};
		var firstDate;
		return common.post({
			port: ports.ngx,
			path: '/login?scope=bookReader'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return common.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			firstDate = res.body.date;
			return common.post({
				port: ports.ngx,
				path: '/login?scope=bookSecond'
			});
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return common.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			res.body.date.should.not.equal(firstDate);
		});
	});

	it("should log in, access url, hit the cache, invalidate the cache with proxy", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testPathTag
		};
		return common.post({
			port: ports.ngx,
			path: '/login'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return common.get(req);
		}).then(function(res) {
			res.headers.should.have.property('x-upcache-lock', 'bookReader, bookSecond');
			res.statusCode.should.equal(200);
			count(req).should.equal(1);
			return common.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			// because it should be a cache hit
			count(req).should.equal(1);
			return common.post(req);
		}).then(function(res) {
			return common.get(req);
		}).then(function(res) {
			count(req).should.equal(2);
		});
	});

	it("should cache with scope-dependent tags", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: scopeDependentTag
		};
		var firstDate, firstCookie;
		return common.post({
			port: ports.ngx,
			path: '/login?id=17'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			firstCookie = headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return common.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			firstDate = res.body.date;
			return common.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			res.body.date.should.equal(firstDate);
			count(req).should.equal(1);
			return common.post({
				port: ports.ngx,
				path: '/login?id=18'
			});
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return common.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			res.body.date.should.not.equal(firstDate);
			count(req).should.equal(2);
			return common.post(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			return common.get(req);
		}).then(function(res) {
			count(req).should.equal(3);
			res.statusCode.should.equal(200);
			headers.Cookie = firstCookie;
			return common.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			count(req).should.equal(3);
		});
	});

	it("should log in and get read access to a url then read that url again without scopes with proxy", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testPathDynamic
		};
		return common.get(req).then(function(res) {
			res.headers.should.have.property('x-upcache-lock', 'dynA, dynB');
			res.headers.should.not.have.property('x-upcache-key-handshake');
			res.statusCode.should.equal(200);
			return common.post({
				port: ports.ngx,
				path: '/login?scope=dynA&scope=dynB'
			})
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return common.get(req);
		}).then(function(res) {
			res.headers.should.not.have.property('x-upcache-key-handshake');
			res.headers.should.have.property('x-upcache-lock', 'dynA, dynB');
			res.statusCode.should.equal(200);
			count(req).should.equal(2);
			delete headers.Cookie;
			return common.get(req);
		}).then(function(res) {
			// res.headers.should.have.property('x-upcache-lock', '');
			res.statusCode.should.equal(200);
			// because it should be a cache hit
			count(req).should.equal(2);
		}).then(function(res) {
			return common.post({
				port: ports.ngx,
				path: '/login?scope=dynA&scope=dynC'
			})
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return common.get(req);
		}).then(function(res) {
			res.headers.should.not.have.property('x-upcache-key-handshake');
			res.headers.should.have.property('x-upcache-lock', 'dynA, dynB');
			res.statusCode.should.equal(200);
			count(req).should.equal(3);
			delete headers.Cookie;
			return common.get(req);
		}).then(function(res) {
			res.headers.should.have.property('x-upcache-lock', 'dynA, dynB');
			res.statusCode.should.equal(200);
			// because it should be a cache hit
			count(req).should.equal(3);
		})
	});


});
