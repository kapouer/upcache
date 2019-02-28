var debug = require('debug')('tag');
var should = require('should');
var fs = require('fs');
var URL = require('url');
var express = require('express');

var runner = require('../spawner');
var tag = require('../tag');

var ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Tag", function suite() {
	var servers, app;
	var testPath = '/tag-test';
	var conditionalPath = "/conditional";
	var conditionalPathNot = "/conditionalnot";
	var untaggedPath = '/untagged';
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

		app.post(testPath, tag('test'), function(req, res, next) {
			res.send('OK');
		});

		app.post("/a", tag('test'), function(req, res, next) {
			res.send('OK');
		});

		app.get('/multiple', tag('one'), tag('two'), function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.post("/multiple", tag('two'), function(req, res, next) {
			res.send('OK');
		});

		app.get(conditionalPath, tag('conditional'), function(req, res, next) {
			count(req, 1);
			res.set('ETag', 'W/"myetag"');
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(conditionalPathNot, tag('conditionalnot'), function(req, res, next) {
			count(req, 1);
			res.set('ETag', 'W/"myetagnot"');
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get('/multiplesame', tag('one'), tag('one', 'two'), tag('+one', 'two', 'three'), function(req, res, next) {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(untaggedPath, function(req, res, next) {
			count(req, 1);
			res.send("ok");
		});

		app.use(runner.errorHandler);
	});

	after(function(done) {
		app.server.close();
		servers.close(done);
	});

	it("should cache a url", function() {
		var req = {
			port: ports.ngx,
			path: testPath
		};
		return runner.get(req).then(function(res) {
			res.headers.should.have.property('x-upcache-tag', 'test');
			return runner.get(req);
		}).then(function(res) {
			res.headers.should.have.property('x-upcache-tag', 'test');
			count(req).should.equal(1);
		});
	});

	it("should invalidate a tag using a post", function() {
		var firstDate;
		var req = {
			port: ports.ngx,
			path: testPath
		};
		return runner.get(req)
		.then(function(res) {
			firstDate = Date.parse(res.body.date);
			res.headers.should.have.property('x-upcache-tag', 'test');
			return runner.post(req, 'postbody');
		}).then(function(res) {
			res.headers.should.have.property('x-upcache-tag', '+test');
			return runner.get(req);
		}).then(function(res) {
			Date.parse(res.body.date).should.be.greaterThan(firstDate);
		});
	});

	it("should invalidate one tag on a route with multiple tags using a post", function() {
		var firstDate;
		var req = {
			port: ports.ngx,
			path: "/multiple"
		};
		return runner.get(req)
		.then(function(res) {
			firstDate = Date.parse(res.body.date);
			res.headers.should.have.property('x-upcache-tag', 'one, two');
			return runner.post(req, 'postbody');
		}).then(function(res) {
			res.headers.should.have.property('x-upcache-tag', '+two');
			return runner.get(req);
		}).then(function(res) {
			Date.parse(res.body.date).should.be.greaterThan(firstDate);
		});
	});

	it("should invalidate a tag using a post to a different path", function() {
		var firstDate;
		var req = {
			port: ports.ngx,
			path: testPath
		};
		return runner.get(req)
		.then(function(res) {
			firstDate = Date.parse(res.body.date);
			res.headers.should.have.property('x-upcache-tag', 'test');
			return runner.post({
				port: ports.ngx,
				path: "/a"
			}, 'postbody');
		}).then(function(res) {
			res.headers.should.have.property('x-upcache-tag', '+test');
			return runner.get(req);
		}).then(function(res) {
			Date.parse(res.body.date).should.be.greaterThan(firstDate);
		});
	});

	it("should handle conditional requests from upstream ETag once cached", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: conditionalPath
		};
		return runner.get(req).then(function(res) {
			res.headers.should.have.property('etag');
			var etag = res.headers.etag;
			headers['If-None-Match'] = res.headers.etag;
			return runner.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(304);
			count(req).should.equal(1);
		});
	});

	it("should not let conditional requests go to upstream", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: conditionalPathNot
		};
		headers['If-None-Match'] = 'W/"myetagnot"';
		return runner.get(req).then(function(res) {
			res.statusCode.should.equal(200);
			count(req).should.equal(1);
			return runner.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(304);
			count(req).should.equal(1);
		});
	});

	it("should not cache responses if not tagged by upstream", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: untaggedPath
		};
		return runner.get(req).then(function(res) {
			res.statusCode.should.equal(200);
			count(req).should.equal(1);
			return runner.get(req);
		}).then(function(res) {
			res.statusCode.should.equal(200);
			count(req).should.equal(2);
		});
	});

	it("should not return multiple identical tags", function() {
		var req = {
			port: ports.ngx,
			path: '/multiplesame'
		};
		return runner.get(req).then(function(res) {
			res.headers.should.have.property('x-upcache-tag', '+one, two, three');
			return runner.get(req);
		}).then(function(res) {
			res.headers.should.have.property('x-upcache-tag', '+one, two, three');
			count(req).should.equal(1);
		});
	});
});
