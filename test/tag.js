const URL = require('url');
const express = require('express');
const assert = require('assert').strict;

const runner = require('../lib/spawner');
const common = require('./common');

const tag = require('..').tag;

const ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Tag", () => {
	let servers, app;
	const testPath = '/tag-test';
	const conditionalPath = "/conditional";
	const conditionalPathNot = "/conditionalnot";
	const untaggedPath = '/untagged';
	const counters = {};

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

	before(async () => {
		servers = await runner(ports);

		app = express();
		app.server = app.listen(ports.app);

		app.get('/a', tag('global'), (req, res, next) => {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testPath, tag('test'), (req, res, next) => {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.post(testPath, tag('test'), (req, res, next) => {
			res.send('OK');
		});

		app.post("/a", tag('test'), (req, res, next) => {
			res.send('OK');
		});

		app.get('/multiple', tag('one'), tag('two'), (req, res, next) => {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.post("/multiple", tag('two'), (req, res, next) => {
			res.send('OK');
		});

		app.get(conditionalPath, tag('conditional'), (req, res, next) => {
			count(req, 1);
			res.set('ETag', 'W/"myetag"');
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(conditionalPathNot, tag('conditionalnot'), (req, res, next) => {
			count(req, 1);
			res.set('ETag', 'W/"myetagnot"');
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get('/multiplesame', tag('one'), tag('one', 'two'), tag('+one', 'two', 'three'), (req, res, next) => {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(untaggedPath, (req, res, next) => {
			count(req, 1);
			res.send("ok");
		});

		app.get("/params/:test", (req, res, next) => {
			if (req.params.test == "none") req.params.test = null;
			next();
		}, tag('site-:test').for('1min'), (req, res, next) => {
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get("/params2/:test", tag('prev'), (req, res, next) => {
			if (req.params.test == "none") req.params.test = null;
			next();
		}, tag('site-:test').for('1min'), (req, res, next) => {
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.use(common.errorHandler);
	});

	after(async () => {
		app.server.close();
		await servers.close();
	});

	it("cache a url", async () => {
		const req = {
			port: ports.ngx,
			path: testPath
		};
		let res = await common.get(req);
		assert.equal(res.headers['x-upcache-tag'], 'test');
		res = await common.get(req);
		assert.equal(res.headers['x-upcache-tag'], 'test');
		assert.equal(count(req), 1);
	});

	it("honor req.params tag replacement", async () => {
		const req = {
			port: ports.ngx,
			path: "/params/me"
		};
		let res = await common.get(req);

		assert.equal(res.headers['x-upcache-tag'], 'site-me');
		assert.equal(res.headers['cache-control'], 'public, max-age=60');
		req.path = "/params/none";
		res = await common.get(req);

		assert.equal('x-upcache-tag' in res.headers, false);
		assert.equal('cache-control' in res.headers, false);
	});

	it("honor req.params tag replacement with a previous tag set", async () => {
		const req = {
			port: ports.ngx,
			path: "/params2/me"
		};
		let res = await common.get(req);
		assert.equal(res.headers['x-upcache-tag'], 'prev, site-me');
		assert.equal(res.headers['cache-control'], 'public, max-age=60');
		req.path = "/params2/none";
		res = await common.get(req);

		assert.equal(res.headers['x-upcache-tag'], 'prev');
		assert.equal('cache-control' in res.headers, false);
	}).timeout(0);

	it("invalidate a tag using a post", async () => {
		const req = {
			port: ports.ngx,
			path: testPath
		};
		let res = await common.get(req);

		const firstDate = Date.parse(res.body.date);
		assert.equal(res.headers['x-upcache-tag'], 'test');
		res = await common.post(req, 'postbody');
		assert.equal(res.headers['x-upcache-tag'], '+test');
		res = await common.get(req);
		assert.ok(Date.parse(res.body.date) > firstDate);
	});

	it("invalidate one tag on a route with multiple tags using a post", async () => {
		const req = {
			port: ports.ngx,
			path: "/multiple"
		};
		let res = await common.get(req);

		const firstDate = Date.parse(res.body.date);
		assert.equal(res.headers['x-upcache-tag'], 'one, two');
		res = await common.post(req, 'postbody');

		assert.equal(res.headers['x-upcache-tag'], '+two');
		res = await common.get(req);

		assert.ok(Date.parse(res.body.date) > firstDate);
	});

	it("invalidate a tag using a post to a different path", async () => {
		const req = {
			port: ports.ngx,
			path: testPath
		};
		let res = await common.get(req);
		const firstDate = Date.parse(res.body.date);
		assert.equal(res.headers['x-upcache-tag'], 'test');
		res = await common.post({
			port: ports.ngx,
			path: "/a"
		}, 'postbody');

		assert.equal(res.headers['x-upcache-tag'], '+test');
		res = await common.get(req);
		assert.ok(Date.parse(res.body.date) > firstDate);
	});

	it("handle conditional requests from upstream ETag once cached", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: conditionalPath
		};
		let res = await common.get(req);
		assert.ok('etag' in res.headers);
		headers['If-None-Match'] = res.headers.etag;
		res = await common.get(req);

		assert.equal(res.statusCode, 304);
		assert.equal(count(req), 1);
	});

	it("not let conditional requests go to upstream", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: conditionalPathNot
		};
		headers['If-None-Match'] = 'W/"myetagnot"';
		let res = await common.get(req);
		assert.equal(res.statusCode, 200);
		assert.equal(count(req), 1);
		res = await common.get(req);

		assert.equal(res.statusCode, 304);
		assert.equal(count(req), 1);
	});

	it("not cache responses if not tagged by upstream", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: untaggedPath
		};
		let res = await common.get(req);
		assert.equal(res.statusCode, 200);
		assert.equal(count(req), 1);
		res = await common.get(req);
		assert.equal(res.statusCode, 200);
		assert.equal(count(req), 2);
	});

	it("not return multiple identical tags", async () => {
		const req = {
			port: ports.ngx,
			path: '/multiplesame'
		};
		let res = await common.get(req);
		assert.equal(res.headers['x-upcache-tag'], '+one, two, three');
		res = await common.get(req);
		assert.equal(res.headers['x-upcache-tag'], '+one, two, three');
		assert.equal(count(req), 1);
	});
});
