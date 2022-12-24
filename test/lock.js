const fs = require('fs');
const Path = require('path');
const URL = require('url');
const cookie = require('cookie');
const express = require('express');
const assert = require('assert').strict;

const runner = require('../lib/spawner');
const common = require('./common');

const scope = require('..').lock({
	privateKey: fs.readFileSync(Path.join(__dirname, 'fixtures/private.pem')).toString(),
	publicKey: fs.readFileSync(Path.join(__dirname, 'fixtures/public.pem')).toString(),
	maxAge: 3600,
	issuer: "test",
	userProperty: 'user'
});

const ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Lock", () => {
	let servers, app;
	const testPath = '/scope-test';
	const testPathNotGranted = '/scope-not-granted-test';
	const testPathWildcardMultiple = '/wildcardmul';
	const testPathWildcard = '/wildcard';
	const testPathHeadersSetting = '/headers';
	const testPathHeadersWithReplacement = '/replacement';
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
			const bearer = scope.login(res, {
				id: req.query.id || 44,
				grants: givemeScope || ['bookWriter', 'bookReader']
			});
			if (req.query.redirect !== undefined) {
				res.redirect(req.query.redirect);
			} else res.send({
				bearer: bearer // used in the test
			});
		});

		app.post('/logout', (req, res, next) => {
			scope.logout(res);
			res.sendStatus(204);
		});

		app.get(testPathHeadersSetting, scope.init, (req, res, next) => {
			count(req, 1);
			assert.ok(req.user);

			scope.headers(res, 'dynA');
			scope.headers(res, ['dynB']);
			scope.headers(res, ['dynC', 'dynD']);
			scope.headers(res, ['dynD', 'dynE', 'dynA']);
			scope.headers(res, 'dynD');

			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testPathHeadersWithReplacement, scope.vary('id-:id'), (req, res, next) => {
			count(req, 1);
			assert.ok(req.user);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testPath, scope.restrict('bookReader', 'bookSecond'), (req, res, next) => {
			assert.equal('user' in req, true);
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testPathNotGranted, scope.restrict('bookReaderWhat'), (req, res, next) => {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testPathWildcardMultiple, scope.vary('book*'), (req, res, next) => {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});
		app.post(testPathWildcardMultiple, (req, res, next) => {
			res.sendStatus(204);
		});

		app.get(testPathWildcard, scope.vary('*'), (req, res, next) => {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get("/user/:id", scope.vary('user-:id'), (req, res, next) => {
			if (req.user.id == req.params.id) res.send({id: parseInt(req.params.id)});
			else res.sendStatus(403);
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

	it("get 401 when accessing a protected url without proxy", async () => {
		const req = {
			port: ports.app,
			path: testPath
		};
		const res = await common.get(req);
		assert.equal(res.statusCode, 401);
		assert.equal(count(req), 0);
	});

	it("log in and get read access to a url without proxy", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.app,
			path: testPath
		};
		let res = await common.post({
			port: ports.app,
			path: '/login'
		});
		assert.equal('set-cookie' in res.headers, true);

		const cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);
		assert.equal(res.headers['x-upcache-lock'], 'bookReader, bookSecond');
		assert.equal(count(req), 1);
	});

	it("log in and not get read access to another url without proxy", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.app,
			path: testPathNotGranted
		};
		let res = await common.post({
			port: ports.app,
			path: '/login'
		});
		assert.ok(res.headers['set-cookie']);
		const cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(res.statusCode, 403);
		assert.equal(count(req), 0);
	});

	it("log in, access, then log out, and be denied access without proxy", async () => {
		const headers = {};
		let res = await common.post({
			port: ports.app,
			path: '/login'
		});
		assert.ok(res.headers['set-cookie']);
		let cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get({
			headers: headers,
			port: ports.app,
			path: testPath
		});

		assert.equal(res.statusCode, 200);
		res = await common.post({
			headers: headers,
			port: ports.app,
			path: "/logout"
		});

		assert.ok(res.headers['set-cookie']);
		cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get({
			headers: headers,
			port: ports.app,
			path: testPath
		});

		assert.equal(res.statusCode, 401);
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

	it("log in and get read access to a url and not hit the cache with proxy", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testPath
		};
		let res = await common.post({
			port: ports.ngx,
			path: '/login'
		});
		assert.ok(res.headers['set-cookie']);
		const cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal('x-upcache-lock-key' in res.headers, false);
		assert.equal(res.headers['x-upcache-lock'], 'bookReader, bookSecond');

		assert.equal(res.statusCode, 200);
		assert.equal(count(req), 1);
		res = await common.get(req);
		assert.equal(res.statusCode, 200);
		// because it should be a cache hit
		assert.equal(count(req), 2);
	});

	it("get headers right with proxy", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testPathHeadersSetting
		};
		const res = await common.get(req);
		assert.equal(res.headers['x-upcache-lock'], 'dynA, dynB, dynC, dynD, dynE');
		assert.equal(res.statusCode, 200);
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

	it("log in with different scopes on a wildcard restriction and cache each variant with proxy", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testPathWildcardMultiple
		};
		let res = await common.post({
			port: ports.ngx,
			path: '/login?scope=book1&scope=book2'
		});
		assert.ok(res.headers['set-cookie']);
		let cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(res.statusCode, 200);
		const firstDate = res.body.date;
		res = await common.post({
			port: ports.ngx,
			path: '/login?scope=book3&scope=book2'
		});

		assert.ok(res.headers['set-cookie']);
		cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);
		assert.equal(res.statusCode, 200);
		assert.notEqual(res.body.date, firstDate);
	});

	it("cache a wildcard-restricted resource without grant then fetch the same with a grant with proxy", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testPathWildcard
		};

		let res = await common.get(req);
		assert.equal(res.statusCode, 200);
		const firstDate = res.body.date;
		res = await common.post({
			port: ports.ngx,
			path: '/login?redirect=' + encodeURIComponent(testPathWildcard),
		});

		assert.ok(res.headers['set-cookie']);
		const cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(res.statusCode, 200);
		assert.notEqual(res.body.date, firstDate);
	});

	it("log in as user and be authorized to read user, then be unauthorized to read another user (without proxy)", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.app,
			path: '/user/45'
		};
		let res = await common.post({
			port: ports.app,
			path: '/login?id=45'
		});
		assert.ok(res.headers['set-cookie']);
		const cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(res.headers['x-upcache-lock'], 'user-:id');
		assert.equal(res.statusCode, 200);
		assert.equal(res.body.id, 45);
		req.path += '1';
		res = await common.get(req);

		assert.equal(res.statusCode, 403);
	});

	it("log in as user and be authorized to read user, then be unauthorized to read another user (with proxy)", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: '/user/45'
		};
		let res = await common.post({
			port: ports.ngx,
			path: '/login?id=45'
		});
		assert.ok(res.headers['set-cookie']);
		const cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(res.headers['x-upcache-lock'], 'user-:id');
		assert.equal(res.statusCode, 200);
		assert.equal(res.body.id, 45);
		req.path += '1';
		res = await common.get(req);

		assert.equal(res.statusCode, 403);
	});

});
