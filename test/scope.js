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
	var counters = {};

	function count(uri) {
		var counter = counters[uri];
		if (counter == null) counter = counters[uri] = 0;
		return counters[uri]++;
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
				bearer: bearer
			});
		});

		app.get(testPath, scope.restrict('bookReader'), function(req, res, next) {
			count(req.path);
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

	it("should log in and get read access to a url", function() {
		return runner.get(host + '/login').then(function(res) {
			res.headers.should.have.property('set-cookie');
			return runner.get({
				headers: {
					Cookie: "bearer=" + res.body.bearer
				},
				port: expressPort,
				path: testPath
			});
		}).then(function(res) {
			res.headers.should.have.property('x-cache-restriction', 'bookReader');
			count(testPath).should.equal(1);
		});
	});


});
