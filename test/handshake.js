const fs = require('fs');
const Path = require('path');
const URL = require('url');
const { strict: assert } = require('assert');
const cookie = require('cookie');
const express = require('express');

const runner = require('../lib/spawner');
const common = require('./common');

const locker = require('..').lock({
	privateKey: fs.readFileSync(Path.join(__dirname, 'fixtures/private.pem')).toString(),
	publicKey: fs.readFileSync(Path.join(__dirname, 'fixtures/public.pem')).toString(),
	maxAge: 3600,
	issuer: "test"
});

const ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Handshake", () => {
	let servers, app;
	const testPathWildcard = '/wildcard';
	const testPathWildcardMultiple = '/partialmatches';
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

	beforeEach(async () => {
		counters = {};
		servers = await runner(ports);

		app = express();
		app.server = app.listen(ports.app);

		app.post('/login', (req, res, next) => {
			let requestedScopes = req.query.scope || [];
			if (!Array.isArray(requestedScopes)) requestedScopes = [requestedScopes];
			const bearer = locker.login(res, {
				id: 44,
				grants: requestedScopes
			});
			if (req.query.redirect !== undefined) {
				res.redirect(req.query.redirect);
			} else res.send({
				bearer: bearer // used in the test
			});
		});

		app.get(testPathWildcardMultiple, locker.restrict('book*'), (req, res, next) => {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});
		app.post(testPathWildcardMultiple, locker.restrict('auth'), (req, res, next) => {
			res.sendStatus(204);
		});

		app.get(testPathWildcard, locker.vary('*'), (req, res, next) => {
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.use(common.errorHandler);
	});

	afterEach(async () => {
		app.server.close();
		await servers.close();
	});


	it("cache a wildcard-restricted resource without grant then fetch the same with a grant with proxy", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testPathWildcard
		};

		const fakeRes = {
			req: {
				hostname: "locahost"
			},
			cookie: function() {}
		};
		let res;

		res = await common.post({
			port: ports.ngx,
			path: testPathWildcardMultiple,
			headers: {
				Cookie: cookie.serialize("bearer", locker.login(fakeRes, {
					scopes: {
						auth: true
					}
				}))
			}
		});
		assert.equal('x-upcache-key-handshake' in res.headers, false);

		res = await common.get(req);
		assert.equal(res.statusCode, 200);

		const firstDate = res.body.date;
		res = await common.post({
			port: ports.ngx,
			path: '/login?scope=test'
		});
		assert.equal('set-cookie' in res.headers, true);

		const cookies = cookie.parse(res.headers['set-cookie'][0]);
		headers.Cookie = cookie.serialize("bearer", cookies.bearer);
		res = await common.get(req);

		assert.equal(res.statusCode, 200);
		assert.notEqual(res.body.date, firstDate);
	});
});
