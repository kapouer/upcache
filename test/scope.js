var should = require('should');
var fs = require('fs');
var runner = require('../runner');
var debug = require('debug')('scope');
var Path = require('path');
var cookie = require('cookie');
var scope = require('../scope')({
	privateKey: fs.readFileSync(Path.join(__dirname, 'private/private.pem')).toString(),
	publicKey: fs.readFileSync(Path.join(__dirname, 'private/public.pem')).toString(),
	maxAge: 3600,
	issuer: "test"
});

var port = 3000;

describe("Scope", function suite() {
	var servers;
	console.log("bypassing nginx - replace expressPort");
	var expressPort = port + 1;
	var host = 'http://localhost:' + expressPort;
	var testPath = '/having-scope-test';
	var testPathNotGranted = '/having-scope-not-granted-test';
	var counters = {};

	function count(uri, inc) {
		var counter = counters[uri];
		if (counter == null) counter = counters[uri] = 0;
		if (inc) counters[uri] += inc;
		return counters[uri];
	}

	before(function(done) {
		servers = runner({
			memcached: {
				port: port + 2
			},
			express: {
				port: port + 1
			},
			nginx: {
				port: port,
				conf: '../scope/index.conf'
			}
		});
		var app = servers.express;

		app.get('/login', function(req, res, next) {
			var bearer = scope.login(res, {
				"user-44": true,
				bookWriter: {
					write: true
				},
				bookReader: {
					read: true
				}
			});
			res.send({
				bearer: bearer // convenient but not technically needed
			});
		});

		app.get('/logout', function(req, res, next) {
			scope.logout(res);
		});

		app.get(testPath, scope.restrict('bookReader'), function(req, res, next) {
			count(req.path, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testPathNotGranted, scope.restrict('bookReaderWhat'), function(req, res, next) {
			count(req.path, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		done();
	});

	after(function(done) {
		servers.close();
		done();
	});

	it("should get 401 when accessing a protected url", function() {
		return runner.get({
			port: expressPort,
			path: testPath
		}).then(function(res) {
			res.statusCode.should.equal(401);
			count(testPath).should.equal(0);
		});
	});

	it("should log in and get read access to a url", function() {
		var headers = {};
		return runner.get(host + '/login').then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get({
				headers: headers,
				port: expressPort,
				path: testPath
			});
		}).then(function(res) {
			res.headers.should.have.property('x-cache-restriction', 'bookReader');
			count(testPath).should.equal(1);
		});
	});

	it("should log in and not get read access to another url", function() {
		var headers = {};
		return runner.get(host + '/login').then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get({
				headers: headers,
				port: expressPort,
				path: testPathNotGranted
			});
		}).then(function(res) {
			res.statusCode.should.equal(403);
			count(testPath).should.equal(1);
		});
	});

	it("should log in then log out", function() {
		var headers = {};
		return runner.get(host + '/login').then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get({
				headers: headers,
				port: expressPort,
				path: "/logout"
			});
		}).then(function(res) {
			res.headers.should.have.property('set-cookie');
			var cookies = cookie.parse(res.headers['set-cookie'][0]);
			headers.Cookie = cookie.serialize("bearer", cookies.bearer);
			return runner.get({
				headers: headers,
				port: expressPort,
				path: testPath
			});
		}).then(function(res) {
			res.statusCode.should.equal(401);
		});
	});


});
