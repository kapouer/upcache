var should = require('should');
var fs = require('fs');
var Path = require('path');
var URL = require('url');
var cookie = require('cookie');
var express = require('express');
var assert = require('assert');

var runner = require('../lib/spawner');
var scope = require('..').lock({
	privateKey: fs.readFileSync(Path.join(__dirname, 'fixtures/private.pem')).toString(),
	publicKey: fs.readFileSync(Path.join(__dirname, 'fixtures/public.pem')).toString(),
	maxAge: 3600,
	issuer: "test",
	userProperty: 'user'
});

var ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Lock", function suite() {
	var servers, app;
	var testPath = '/scope-test';
	var testPathNotGranted = '/scope-not-granted-test';
	var testPathWildcardMultiple = '/wildcardmul';
	var testPathWildcard = '/wildcard';
	var testPathHeadersSetting = '/headers';
	var testPathHeadersWithReplacement = '/replacement';
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
			var bearer = scope.login(res, {
				id: req.query.id || 44,
				grants: givemeScope || ['bookWriter', 'bookReader']
			});
			if (req.query.redirect !== undefined) {
				res.redirect(req.query.redirect);
			} else res.send({
				bearer: bearer // used in the test
			});
		});

		app.post('/logout', function(req, res, next) {
			scope.logout(res);
			res.sendStatus(204);
		});

		app.get(testPathHeadersSetting, scope.init, function(req, res, next) {
			count(req, 1);
			assert.ok(req.user);

			scope.headers(res, 'dynA');
			scope.headers(res, ['dynB']);
			scope.headers(res, ['dynC', 'dynD']);
			scope.headers(res, ['dynD', 'dynE', 'dynA']);
			scope.headers(res, 'dynD');

			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testPathHeadersWithReplacement, scope.vary('id-:id'), function(req, res, next) {
			count(req, 1);
			assert.ok(req.user);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testPath, scope.restrict('bookReader', 'bookSecond'), function(req, res, next) {
			req.should.have.property('user');
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

		app.get(testPathWildcardMultiple, scope.vary('book*'), function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});
		app.post(testPathWildcardMultiple, function(req, res, next) {
			res.sendStatus(204);
		});

		app.get(testPathWildcard, scope.vary('*'), function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get("/user/:id", scope.vary('user-:id'), function(req, res, next) {
			if (req.user.id == req.params.id) res.send({id: parseInt(req.params.id)});
			else res.sendStatus(403);
		});

		app.use(runner.errorHandler);
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
			res.headers.should.have.property('x-upcache-lock', 'bookReader, bookSecond');
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

	it("should log in and get read access to a url and not hit the cache with proxy", function() {
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
			res.headers.should.not.have.property('x-upcache-lock-key');
			res.headers.should.have.property('x-upcache-lock', 'bookReader, bookSecond');
			res.statusCode.should.equal(200);
			count(req).should.equal(1);
			return runner.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			// because it should be a cache hit
			count(req).should.equal(2);
		});
	});

	it("should get headers right with proxy", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testPathHeadersSetting
		};
		return runner.get(req).then(function(res) {
			res.headers.should.have.property('x-upcache-lock', 'dynA, dynB, dynC, dynD, dynE');
			res.statusCode.should.equal(200);
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

	it("should log in with different scopes on a wildcard restriction and cache each variant with proxy", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testPathWildcardMultiple
		};
		var firstDate;
		return runner.post({
			port: ports.ngx,
			path: '/login?scope=book1&scope=book2'
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
				path: '/login?scope=book3&scope=book2'
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

	it("should cache a wildcard-restricted resource without grant then fetch the same with a grant with proxy", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testPathWildcard
		};
		var firstDate;
		return runner.get(req).then(function(res) {
			res.statusCode.should.equal(200);
			firstDate = res.body.date;
			return runner.post({
				port: ports.ngx,
				path: '/login?redirect=' + encodeURIComponent(testPathWildcard),
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

	it("should log in as user and be authorized to read user, then be unauthorized to read another user (without proxy)", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.app,
			path: '/user/45'
		};
		var firstDate;
		return runner.post({
			port: ports.app,
			path: '/login?id=45'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get(req);
		}).then(function(res) {
			res.headers.should.have.property('x-upcache-lock', 'user-:id');
			res.statusCode.should.equal(200);
			res.body.id.should.equal(45);
			req.path += '1';
			return runner.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(403);
		});
	});

	it("should log in as user and be authorized to read user, then be unauthorized to read another user (with proxy)", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: '/user/45'
		};
		return runner.post({
			port: ports.ngx,
			path: '/login?id=45'
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get(req);
		}).then(function(res) {
			res.headers.should.have.property('x-upcache-lock', 'user-:id');
			res.statusCode.should.equal(200);
			res.body.id.should.equal(45);
			req.path += '1';
			return runner.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(403);
		});
	});

});
