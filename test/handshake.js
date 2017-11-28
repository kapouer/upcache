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
	var testPathWildcard = '/wildcard';
	var testPathWildcardMultiple = '/partialmatches';
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

	beforeEach(function(done) {
		counters = {};
		servers = runner(ports, done);

		app = express();
		app.server = app.listen(ports.app);

		app.post('/login', function(req, res, next) {
			var requestedScopes = req.query.scope || [];
			if (!Array.isArray(requestedScopes)) requestedScopes = [requestedScopes];
			var scopes = {};
			requestedScopes.forEach(function(myscope) {
				scopes[myscope] = true;
			});
			var bearer = scope.login(res, {id: 44, scopes: scopes});
			if (req.query.redirect !== undefined) {
				res.redirect(req.query.redirect);
			} else res.send({
				bearer: bearer // used in the test
			});
		});

		app.get(testPathWildcardMultiple, scope.restrict('book*'), function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});
		app.post(testPathWildcardMultiple, scope.restrict('auth'), function(req, res, next) {
			res.sendStatus(204);
		});

		app.get(testPathWildcard, scope.restrict('*'), function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.use(runner.errorHandler);
	});

	afterEach(function(done) {
		app.server.close();
		servers.close(done);
	});


	it("should cache a wildcard-restricted resource without grant then fetch the same with a grant with proxy", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testPathWildcard
		};
		var firstDate;
		var fakeRes = {
			req: {
				hostname: "locahost"
			},
			cookie: function() {}
		};
		return runner.post({
			port: ports.ngx,
			path: testPathWildcardMultiple,
			headers: {
				Cookie: cookie.serialize("bearer", scope.login(fakeRes, {scopes: {
					auth: true
				}}))
			}
		}).then(function(res) {
			res.headers.should.not.have.property('x-upcache-key-handshake');
			return runner.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			firstDate = res.body.date;
			return runner.post({
				port: ports.ngx,
				path: '/login?scope=test'
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
