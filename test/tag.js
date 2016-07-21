var should = require('should');
var fs = require('fs');
var runner = require('./runner');
var debug = require('debug')('tag');

var port = 3000;

describe("Tag", function suite() {
	var servers;
	var host = 'http://localhost:' + port;
	var testPath = '/having-tag-test';
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
				conf: '../../src/tag.conf'
			}
		});
		var app = servers.express;
		app.use(require('../src/tag'));

		app.get('/a', function(req, res, next) {
			count(req.path);
			res.set('X-Cache-Tag', 'global');
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testPath, function(req, res, next) {
			count(req.path);
			res.set('X-Cache-Tag', 'test');
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.post(testPath, function(req, res, next) {
			res.send('OK');
		});

		app.post("/a", function(req, res, next) {
			res.set('X-Cache-Tag', 'test');
			res.send('OK');
		});

		done();
	});

	after(function(done) {
		servers.close(done);
	});

	it("should cache a url", function() {
		return runner.get(host + testPath).then(function(res) {
			res.headers.should.have.property('x-cache-tag', 'test');
			return runner.get(host + testPath);
		}).then(function(res) {
			res.headers.should.have.property('x-cache-tag', 'test');
			count('/having-tag-test').should.equal(1);
		});
	});

	it("should invalidate a tag using a post", function() {
		var firstDate;
		return runner.get(host + testPath)
		.then(function(res) {
			firstDate = Date.parse(res.body.date);
			res.headers.should.have.property('x-cache-tag', 'test');
			return runner.post(host + testPath, 'postbody');
		}).then(function(res) {
			res.headers.should.have.property('x-cache-tag', '+test');
			return runner.get(host + testPath);
		}).then(function(res) {
			Date.parse(res.body.date).should.be.greaterThan(firstDate);
		});
	});

	it("should invalidate a tag using a post to a different path", function() {
		var firstDate;
		return runner.get(host + testPath)
		.then(function(res) {
			firstDate = Date.parse(res.body.date);
			res.headers.should.have.property('x-cache-tag', 'test');
			return runner.post(host + "/a", 'postbody');
		}).then(function(res) {
			res.headers.should.have.property('x-cache-tag', '+test');
			return runner.get(host + testPath);
		}).then(function(res) {
			Date.parse(res.body.date).should.be.greaterThan(firstDate);
		});
	});
});
