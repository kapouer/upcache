var should = require('should');
var fs = require('fs');
var runner = require('./runner');
var debug = require('debug')('version');

var port = 3000;

describe("Loading ressources", function suite() {
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

	it("should increase version when sending a POST, else keep same version", function() {
		getCounterA = 0;
		return runner.get(uri)
		.then(function(res) {
			res.headers.should.have.property('x-cache-version', '1');
			return runner.post(uri, 'postbody');
		}).then(function() {
			return runner.get(uri);
		}).then(function(res) {
			res.headers.should.have.property('x-cache-version', '2');
			return runner.get(uri);
		}).then(function(res) {
			res.headers.should.have.property('x-cache-version', '2');
			getCounterA.should.equal(2);
		});
	});
});
