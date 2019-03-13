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
var map = upcache.map;

var ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Map and Lock", function suite() {
	var servers, app;
	var testPath = '/dynamic';
	var testPathMapped = '/mapped';
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
			var user = {
				id: req.query && req.query.id || 44,
				grants: givemeScope || ['bookWriter', 'bookReader']
			};
			var bearer = locker.login(res, user);
			res.send({
				user: user,
				bearer: bearer // convenient but not technically needed
			});
		});

		app.post('/logout', function(req, res, next) {
			locker.logout(res);
			res.sendStatus(204);
		});

		app.get(testPath, upcache.tag('app'), locker.init, function(req, res, next) {
			count(req, 1);

			var grants = req.user.grants || [];
			var locks = ['dynA', 'dynB'];
			locker.headers(res, locks);

			if (!locks.some(function(lock) {
				return grants.includes(lock);
			})) {
				map(res, testPathMapped);
				res.status(403);
			} else {
				res.status(200); // useless but indicates it's on purpose
			}
			res.send({
				value: (req.path || '/').substring(1),
				date: Date.now(),
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

	it("should map several unauthorized users to the same cache key with proxy", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testPath
		};
		var result;
		return common.get(req).then(function(res) {
			res.statusCode.should.equal(403);
			res.headers.should.have.property('x-upcache-map', testPathMapped);
			result = res.body;
			return common.post({
				port: ports.ngx,
				path: '/login',
				query: {
					scope: 'what'
				}
			});
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return common.get(req);
		}).then(function(res) {
			delete req.headers.Cookie;
			res.statusCode.should.equal(403);
			result.should.deepEqual(res.body);
			count(req).should.equal(1);
			return common.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(403);
			result.should.deepEqual(res.body);
			res.headers.should.have.property('x-upcache-map', testPathMapped);
			count(req).should.equal(1);
			return common.post({
				port: ports.ngx,
				path: '/login?scope=dynA'
			});
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return common.get(req);
		}).then(function(res) {
			count(req).should.equal(2);
			res.statusCode.should.equal(200);
			res.body.usergrants.should.deepEqual(['dynA']);
			res.headers.should.not.have.property('x-upcache-map');
			return common.get(req);
		}).then(function(res) {
			count(req).should.equal(2);
			res.statusCode.should.equal(200);
			res.body.usergrants.should.deepEqual(['dynA']);
			res.headers.should.not.have.property('x-upcache-map');
		});
	});


});
