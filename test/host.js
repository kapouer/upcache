const URL = require('url');
const express = require('express');
const { strict: assert } = require('assert');

const runner = require('../lib/spawner');
const common = require('./common');

const tag = require('..').tag;

const ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Host", () => {
	let servers, app;
	const testPath = '/map-host';

	let good = 0;
	let bad = 0;

	before(async () => {
		servers = await runner(ports);

		app = express();
		app.server = app.listen(ports.app);
		app.fakeHost = 'example.com';

		app.get(testPath, tag('test').for('1d'), (req, res, next) => {
			if (req.get('Host') == app.fakeHost) good++;
			else bad++;
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

	});

	after(async () => {
		app.server.close();
		await servers.close();
	});

	beforeEach(() => {
		good = 0;
		bad = 0;
	});

	it("cache using Host http header, not using server_name", async () => {
		const req = {
			port: ports.ngx,
			path: testPath,
			headers: {
				Host: app.fakeHost
			}
		};

		let res = await common.get(req);

		const result = res.body.toString();

		res = await common.get(req);
		assert.equal(res.body.toString(), result);
		res = await common.get({
			...req, headers: {}
		});
		assert.equal(good, 1);
		assert.equal(bad, 1);

	});

});
