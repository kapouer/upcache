var debug = require('debug')('tag');
var should = require('should');
var fs = require('fs');
var URL = require('url');

var runner = require('./runner');
var tag = require('../tag');

var port = 3000;

describe("Tag", function suite() {
	var servers;
	var testPath = '/tag-test';
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
		servers = runner({
			memcached: {
				port: port + 2
			},
			express: {
				port: port + 1
			},
			nginx: {
				port: port
			}
		}, done);

		var app = servers.express;

		app.get('/a', tag('global'), function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testPath, tag('test'), function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.post(testPath, tag(), function(req, res, next) {
			res.send('OK');
		});

		app.post("/a", tag('test'), function(req, res, next) {
			res.send('OK');
		});
	});

	after(function(done) {
		servers.close(done);
	});

	it("should cache a url", function() {
		var req = {
			port: port,
			path: testPath
		};
		return runner.get(req).then(function(res) {
			res.headers.should.have.property('x-cache-tag', 'test');
			return runner.get(req);
		}).then(function(res) {
			res.headers.should.have.property('x-cache-tag', 'test');
			count(req).should.equal(1);
		});
	});

	it("should invalidate a tag using a post", function() {
		var firstDate;
		var req = {
			port: port,
			path: testPath
		};
		return runner.get(req)
		.then(function(res) {
			firstDate = Date.parse(res.body.date);
			res.headers.should.have.property('x-cache-tag', 'test');
			return runner.post(req, 'postbody');
		}).then(function(res) {
			res.headers.should.have.property('x-cache-tag', '+test');
			return runner.get(req);
		}).then(function(res) {
			Date.parse(res.body.date).should.be.greaterThan(firstDate);
		});
	});

	it("should invalidate a tag using a post to a different path", function() {
		var firstDate;
		var req = {
			port: port,
			path: testPath
		};
		return runner.get(req)
		.then(function(res) {
			firstDate = Date.parse(res.body.date);
			res.headers.should.have.property('x-cache-tag', 'test');
			return runner.post({
				port: port,
				path: "/a"
			}, 'postbody');
		}).then(function(res) {
			res.headers.should.have.property('x-cache-tag', '+test');
			return runner.get(req);
		}).then(function(res) {
			Date.parse(res.body.date).should.be.greaterThan(firstDate);
		});
	});
});
