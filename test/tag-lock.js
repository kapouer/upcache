const fs = require('fs');
const Path = require('path');
const URL = require('url');
const cookie = require('cookie');
const express = require('express');
const assert = require('assert').strict;

const runner = require('../lib/spawner');
const common = require('./common');

const upcache = require('..');
const locker = upcache.lock({
	privateKey: fs.readFileSync(Path.join(__dirname, 'fixtures/private.pem')).toString(),
	publicKey: fs.readFileSync(Path.join(__dirname, 'fixtures/public.pem')).toString(),
	maxAge: 3600,
	issuer: "test",
	userProperty: "user"
});
const tag = upcache.tag;

const ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Tag and Lock", () => {
	let servers, app;
	const testPath = '/full-scope-test';
	const testPathTag = '/full-scope-tag-test';
	const testPathNotGranted = '/full-scope-not-granted-test';
	const scopeDependentTag = '/scope-dependent-tag';
	const testPathDynamic = '/dynamic';
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

	before(async () => {
		servers = await runner(ports);

		app = express();
		app.server = app.listen(ports.app);

		app.post('/login', (req, res, next) => {
			let givemeScope = req.query.scope;
			if (givemeScope && !Array.isArray(givemeScope)) givemeScope = [givemeScope];
			const bearer = locker.login(res, {
				id: req.query && req.query.id || 44,
				grants: givemeScope || ['bookWriter', 'bookReader']
			});
			res.send({
				bearer: bearer // convenient but not technically needed
			});
		});

		app.post('/logout', (req, res, next) => {
			locker.logout(res);
			res.sendStatus(204);
		});

		app.get('/', (req, res, next) => {
			res.send(req.get('x-upcache') ? "ok" : "not ok");
		});

		app.get(testPath, tag('test'), locker.restrict('bookReader', 'bookSecond'), (req, res, next) => {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.post(testPath, (req, res, next) => {
			res.sendStatus(204);
		});

		app.get(testPathTag, tag("full"), locker.restrict('bookReader', 'bookSecond'), (req, res, next) => {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.post(testPathTag, tag("full"), (req, res, next) => {
			res.sendStatus(204);
		});

		app.get(testPathNotGranted, tag("apart"), locker.restrict('bookReaderWhat'), (req, res, next) => {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(scopeDependentTag, locker.restrict('user-:id'), (req, res, next) => {
			tag('usertag' + req.user.id)(req, res, next);
		}, (req, res, next) => {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});
		app.post(scopeDependentTag, tag("usertag18"), (req, res, next) => {
			res.sendStatus(200);
		});

		app.get(testPathDynamic, locker.init, tag('test'), (req, res, next) => {
			count(req, 1);

			const grants = req.user.grants;
			const locks = ['dynA', 'dynB'];
			locker.headers(res, locks);

			res.send({
				value: (req.path || '/').substring(1),
				date: new Date(),
				usergrants: grants
			});
		});

		app.use(common.errorHandler);
	});

	after(async () => {
		app.server.close();
		await servers.close();
	});

	beforeEach(() => {
		counters = {};
	});

	it("set X-Upcache version in request header", async () => {
		const res = await common.get({
			port: ports.ngx,
			path: '/'
		});
		assert.equal(res.body, 'ok');
	});

	it("get 401 when accessing a protected url with proxy", async () => {
		const req = {
			port: ports.ngx,
			path: testPath
		};
		const res = await common.get(req);
		assert.equal(res.statusCode, 401);
		assert.equal(count(req), 0);
	});

	it("log in and get read access to a url and hit the cache with proxy", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testPath
		};
		let res = await common.get(req);
		assert.equal(res.headers['x-upcache-lock'], 'bookReader, bookSecond');
		assert.equal(res.statusCode, 401);
		assert.equal(count(req), 0);

		res = await common.post({
			port: ports.ngx,
			path: '/login'
		});

		assert.ok(res.headers['set-cookie']);
		const cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(res.headers['x-upcache-lock'], 'bookReader, bookSecond');
		assert.equal(res.statusCode, 200);
		assert.equal(count(req), 1);
		res = await common.get(req);

		assert.equal(res.statusCode, 200);
		// because it should be a cache hit
		assert.equal(count(req), 1);
	});

	it("log in and not get read access to another url with proxy", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testPathNotGranted
		};
		let res = await common.post({
			port: ports.ngx,
			path: '/login'
		});
		assert.ok(res.headers['set-cookie']);
		const cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(res.statusCode, 403);
		assert.equal(count(req), 0);
	});

	it("log in, access, then log out, and be denied access with proxy", async () => {
		const headers = {};
		let res = await common.post({
			port: ports.ngx,
			path: '/login'
		});
		assert.ok(res.headers['set-cookie']);
		let cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get({
			headers: headers,
			port: ports.ngx,
			path: testPath
		});

		assert.equal(res.statusCode, 200);
		res = await common.post({
			headers: headers,
			port: ports.ngx,
			path: "/logout"
		});

		assert.ok(res.headers['set-cookie']);
		cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get({
			headers: headers,
			port: ports.ngx,
			path: testPath
		});

		assert.equal(res.statusCode, 401);
	});

	it("log in with different scopes and cache each variant with proxy", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testPath
		};

		let res = await common.post({
			port: ports.ngx,
			path: '/login?scope=bookReader'
		});
		assert.ok(res.headers['set-cookie']);
		let cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(res.statusCode, 200);
		const firstDate = res.body.date;
		res = await common.post({
			port: ports.ngx,
			path: '/login?scope=bookSecond'
		});

		assert.ok(res.headers['set-cookie']);
		cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(res.statusCode, 200);
		assert.notEqual(res.body.date, firstDate);
	});

	it("log in, access url, hit the cache, invalidate the cache with proxy", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testPathTag
		};
		let res = await common.post({
			port: ports.ngx,
			path: '/login'
		});
		assert.ok(res.headers['set-cookie']);
		const cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(res.headers['x-upcache-lock'], 'bookReader, bookSecond');
		assert.equal(res.statusCode, 200);
		assert.equal(count(req), 1);
		res = await common.get(req);

		assert.equal(res.statusCode, 200);
		// because it should be a cache hit
		assert.equal(count(req), 1);
		res = await common.post(req);
		res = await common.get(req);
		assert.equal(count(req), 2);
	});

	it("cache with scope-dependent tags", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: scopeDependentTag
		};

		let res = await common.post({
			port: ports.ngx,
			path: '/login?id=17'
		});
		assert.ok(res.headers['set-cookie']);
		let cookies = cookie.parse(res.headers['set-cookie'][0]);
		const firstCookie = headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(res.statusCode, 200);
		const firstDate = res.body.date;
		res = await common.get(req);


		assert.equal(res.statusCode, 200);
		assert.equal(res.body.date, firstDate);
		assert.equal(count(req), 1);
		res = await common.post({
			port: ports.ngx,
			path: '/login?id=18'
		});

		assert.ok(res.headers['set-cookie']);
		cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(res.statusCode, 200);
		assert.notEqual(res.body.date, firstDate);
		assert.equal(count(req), 2);
		res = await common.post(req);

		assert.equal(res.statusCode, 200);
		res = await common.get(req);

		assert.equal(count(req), 3);
		assert.equal(res.statusCode, 200);
		headers.Cookie = firstCookie;
		res = await common.get(req);

		assert.equal(res.statusCode, 200);
		assert.equal(count(req), 3);
	});

	it("log in and get read access to a url then read that url again without scopes with proxy", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testPathDynamic
		};
		let res = await common.get(req);
		assert.equal(res.headers['x-upcache-lock'], 'dynA, dynB');
		assert.equal('x-upcache-key-handshake' in res.headers, false);
		assert.equal(res.statusCode, 200);
		res = await common.post({
			port: ports.ngx,
			path: '/login?scope=dynA&scope=dynB'
		});

		assert.ok(res.headers['set-cookie']);
		let cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal('x-upcache-key-handshake' in res.headers, false);
		assert.equal(res.headers['x-upcache-lock'], 'dynA, dynB');
		assert.equal(res.statusCode, 200);
		assert.equal(count(req), 2);
		delete headers.Cookie;
		res = await common.get(req);

		assert.equal(res.statusCode, 200);
		// because it should be a cache hit
		assert.equal(count(req), 2);

		res = await common.post({
			port: ports.ngx,
			path: '/login?scope=dynA&scope=dynC'
		});

		assert.ok(res.headers['set-cookie']);
		cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal('x-upcache-key-handshake' in res.headers, false);
		assert.equal(res.headers['x-upcache-lock'], 'dynA, dynB');
		assert.equal(res.statusCode, 200);
		assert.equal(count(req), 3);
		delete headers.Cookie;
		res = await common.get(req);

		assert.equal(res.headers['x-upcache-lock'], 'dynA, dynB');
		assert.equal(res.statusCode, 200);
		// because it should be a cache hit
		assert.equal(count(req), 3);
	});
});
