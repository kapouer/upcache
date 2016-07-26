var debug = require('debug')('scope');
var should = require('should');
var fs = require('fs');
var Path = require('path');
var URL = require('url');
var cookie = require('cookie');
var express = require('express');

var runner = require('../spawner');
var scope = require('../scope')({
	privateKey: fs.readFileSync(Path.join(__dirname, 'fixtures/private.pem')).toString(),
	publicKey: fs.readFileSync(Path.join(__dirname, 'fixtures/public.pem')).toString(),
	maxAge: 3600,
	issuer: "test"
});

var ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Scope", function suite() {
	var servers, app;
	var testPath = '/scope-test';
	var testPathNotGranted = '/scope-not-granted-test';
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
			var scopes = {
				"user-44": true,
				bookWriter: {
					write: true
				},
				bookReader: {
					read: true
				}
			};
			if (givemeScope) scopes = {[givemeScope]: true};
			var bearer = scope.login(res, {id: 44, scopes: scopes});
			res.send({
				bearer: bearer // used in the test
			});
		});

		app.post('/logout', function(req, res, next) {
			scope.logout(res);
			res.sendStatus(204);
		});

		app.get(testPath, scope.restrict('bookReader', 'bookSecond'), function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testPathNotGranted, scope.restrict('bookReaderWhat'), function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});
	});

	after(function(done) {
		app.server.close();
		servers.close(done);
	});

	beforeEach(function() {
		counters = {};
	});

	it("should get 401 when accessing a protected url without proxy", function() {
		var req = {
			port: ports.app,
			path: testPath
		};
		return runner.get(req).then(function(res) {
			res.statusCode.should.equal(401);
			count(req).should.equal(0);
		});
	});

	it("should log in and get read access to a url without proxy", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.app,
			path: testPath
		};
		return runner.post({
			port: ports.app,
			path: '/login'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get(req);
		}).then(function(res) {
			res.headers.should.have.property('x-cache-scope', 'bookReader, bookSecond');
			count(req).should.equal(1);
		});
	});

	it("should log in and not get read access to another url without proxy", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.app,
			path: testPathNotGranted
		};
		return runner.post({
			port: ports.app,
			path: '/login'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(403);
			count(req).should.equal(0);
		});
	});

	it("should log in, access, then log out, and be denied access without proxy", function() {
		var headers = {};
		return runner.post({
			port: ports.app,
			path: '/login'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get({
				headers: headers,
				port: ports.app,
				path: testPath
			});
		}).then(function(res) {
			res.statusCode.should.equal(200);
			return runner.post({
				headers: headers,
				port: ports.app,
				path: "/logout"
			});
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get({
				headers: headers,
				port: ports.app,
				path: testPath
			});
		}).then(function(res) {
			res.statusCode.should.equal(401);
		});
	});

	it("should get 401 when accessing a protected url with proxy", function() {
		var req = {
			port: ports.ngx,
			path: testPath
		};
		return runner.get(req).then(function(res) {
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
		return runner.post({
			port: ports.ngx,
			path: '/login'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get(req);
		}).then(function(res) {
			res.headers.should.have.property('x-cache-scope', 'bookReader, bookSecond');
			res.statusCode.should.equal(200);
			count(req).should.equal(1);
			return runner.get(req);
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
		return runner.post({
			port: ports.ngx,
			path: '/login'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(403);
			count(req).should.equal(0);
		});
	});

	it("should log in, access, then log out, and be denied access with proxy", function() {
		var headers = {};
		return runner.post({
			port: ports.ngx,
			path: '/login'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get({
				headers: headers,
				port: ports.ngx,
				path: testPath
			});
		}).then(function(res) {
			res.statusCode.should.equal(200);
			return runner.post({
				headers: headers,
				port: ports.ngx,
				path: "/logout"
			});
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get({
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
		return runner.post({
			port: ports.ngx,
			path: '/login?scope=bookReader'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			firstDate = res.body.date;
			return runner.post({
				port: ports.ngx,
				path: '/login?scope=bookSecond'
			});
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			res.body.date.should.not.equal(firstDate);
		});
	});
});
