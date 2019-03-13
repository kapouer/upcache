var should = require('should');
var fs = require('fs');
var URL = require('url');
var express = require('express');

var runner = require('../lib/spawner');
var common = require('./common');

var map = require('..').map;
var tag = require('..').tag;

var ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Map", function suite() {
	var servers, app;
	var testPath = '/map-test';
	var mappedTestPath = testPath + '-mapped';
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

		app.get(testPath, tag('app'), function(req, res, next) {
			map(res, mappedTestPath);
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});
	});

	after(function(done) {
		app.server.close();
		servers.close(done);
	});

	beforeEach(function() {
		counters = {};
	});

	it("should map testPath to mappedTestPath", function() {
		var req = {
			port: ports.ngx,
			path: testPath
		};
		var reqm = {
			port: ports.ngx,
			path: mappedTestPath
		};
		var result;
		return common.get(req).then(function(res) {
			result = res.body.toString();
			return common.get(req);
		}).then(function(res) {
			res.body.toString().should.equal(result);
			count(req).should.equal(1);
			res.headers.should.have.property('x-upcache-map', mappedTestPath);
			return common.get(reqm);
		}).then(function(res) {
			res.body.toString().should.equal(result);
			count(req).should.equal(1);
			res.headers.should.have.property('x-upcache-map', mappedTestPath);
		});
	});
});
