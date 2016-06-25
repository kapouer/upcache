var should = require('should');
var fs = require('fs');
var runner = require('./runner');
var debug = require('debug')('version');

var port = 3000;

describe("Per-domain version", function suite() {
	var servers;
	var uri = 'http://localhost:' + port;
	var getCounterA;

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
				conf: '../version/nginx.conf'
			}
		});
		var app = servers.express;
		app.use(require('../version/'));

		app.get('*', function(req, res, next) {
			debug("app received GET");
			getCounterA++;
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.post('*', function(req, res, next) {
			debug("app received POST");
			res.send('OK');
		});
		done();
	});

	after(function(done) {
		servers.close();
		done();
	});

	it("should increase version of all resources when sending a POST", function() {
		getCounterA = 0;
		return runner.get(uri + '/a')
		.then(function(res) {
			res.headers.should.have.property('x-cache-version', '1');
			return runner.post(uri + '/b', 'postbody');
		}).then(function() {
			return runner.get(uri + '/a');
		}).then(function(res) {
			res.body.should.have.property('value', 'a');
			res.headers.should.have.property('x-cache-version', '2');
			return runner.get(uri + '/a');
		}).then(function(res) {
			res.headers.should.have.property('x-cache-version', '2');
			getCounterA.should.equal(2);
		});
	});
});
