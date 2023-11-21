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
const map = upcache.map;

const ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Map and Lock", () => {
	let servers, app;
	const testPath = '/dynamic';
	const testPathMapped = '/mapped';
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
			const user = {
				id: req.query && req.query.id || 44,
				grants: givemeScope || ['bookWriter', 'bookReader']
			};
			const bearer = locker.login(res, user);
			res.send({
				user: user,
				bearer: bearer // convenient but not technically needed
			});
		});

		app.post('/logout', (req, res, next) => {
			locker.logout(res);
			res.sendStatus(204);
		});

		app.get(testPath, upcache.tag('app'), locker.init, (req, res, next) => {
			count(req, 1);

			const grants = req.user.grants;
			const locks = ['dynA', 'dynB'];
			locker.headers(res, locks);

			if (!locks.some((lock) => {
				return grants.includes(lock);
			})) {
				map(res, testPathMapped);
				res.status(403);
			} else {
				res.status(200); // useless but indicates it's on purpose
			}
			res.send({
				value: (req.path || '/').substring(1),
				date: Date.now(),
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

	it("map several unauthorized users to the same cache key with proxy", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testPath
		};

		let res = await common.get(req);
		assert.equal(res.statusCode, 403);
		assert.equal(res.headers['x-upcache-map'], testPathMapped);
		const result = res.body;
		res = await common.post({
			port: ports.ngx,
			path: '/login',
			query: {
				scope: 'what'
			}
		});
		assert.ok('set-cookie' in res.headers);
		let cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);
		delete req.headers.Cookie;
		assert.equal(res.statusCode, 403);
		assert.deepEqual(result, res.body);
		assert.equal(count(req), 1);
		res = await common.get(req);

		assert.equal(res.statusCode, 403);
		assert.deepEqual(result, res.body);
		assert.equal(res.headers['x-upcache-map'], testPathMapped);
		assert.equal(count(req), 1);
		res = await common.post({
			port: ports.ngx,
			path: '/login?scope=dynA'
		});

		assert.ok('set-cookie' in res.headers);
		cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(count(req), 2);
		assert.equal(res.statusCode, 200);
		assert.deepEqual(res.body.usergrants, ['dynA']);
		assert.equal('x-upcache-map' in res.headers, false);
		res = await common.get(req);

		assert.equal(count(req), 2);
		assert.equal(res.statusCode, 200);
		assert.deepEqual(res.body.usergrants, ['dynA']);
		assert.equal('x-upcache-map' in res.headers, false);
	});
});
