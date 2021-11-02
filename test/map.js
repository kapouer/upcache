const URL = require('url');
const express = require('express');

const runner = require('../lib/spawner');
const common = require('./common');

const map = require('..').map;
const tag = require('..').tag;

const ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Map", () => {
	let servers, app;
	const testPath = '/map-test';
	const mappedTestPath = testPath + '-mapped';
	let counters = {};

	function count(uri, inc) {
		if (typeof uri != "string") {
			if (uri.get) uri = uri.protocol + '://' + uri.get('Host') + uri.path;
			else uri = URL.format(Object.assign({
				protocol: 'http',
				hostname: 'localhost',
				pathname: uri.path
			}, uri));
		}
		let counter = counters[uri];
		if (counter == null) counter = counters[uri] = 0;
		if (inc) counters[uri] += inc;
		return counters[uri];
	}

	before((done) => {
		servers = runner(ports, done);

		app = express();
		app.server = app.listen(ports.app);

		app.get(testPath, tag('app'), (req, res, next) => {
			map(res, mappedTestPath);
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});
	});

	after((done) => {
		app.server.close();
		servers.close(done);
	});

	beforeEach(() => {
		counters = {};
	});

	it("should map testPath to mappedTestPath", () => {
		const req = {
			port: ports.ngx,
			path: testPath
		};
		const reqm = {
			port: ports.ngx,
			path: mappedTestPath
		};
		let result;
		return common.get(req).then((res) => {
			result = res.body.toString();
			return common.get(req);
		}).then((res) => {
			res.body.toString().should.equal(result);
			count(req).should.equal(1);
			res.headers.should.have.property('x-upcache-map', mappedTestPath);
			return common.get(reqm);
		}).then((res) => {
			res.body.toString().should.equal(result);
			count(req).should.equal(1);
			res.headers.should.have.property('x-upcache-map', mappedTestPath);
		});
	});
});
