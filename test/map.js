const URL = require('url');
const express = require('express');
const { strict: assert } = require('assert');

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
	const mappedTestPath = `${testPath}-mapped`;
	const testVary = "/map-vary";
	const mappedTestVary = `${testVary}-mapped`;

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

		app.get(testPath, tag('app'), (req, res, next) => {
			map(res, mappedTestPath);
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testVary, tag('app'), (req, res, next) => {
			map(res, mappedTestVary);
			res.vary('Accept-Language');
			res.append('Vary', 'Sec-Purpose');
			count(req, 1);
			const langs = ['en', 'fr'];
			const suffix = req.get('Sec-Purpose') ?? '';
			if (req.acceptsLanguages(langs) == 'en') {
				res.set('Content-Language', 'en');
				res.send('Good !' + suffix);
			} else if (req.acceptsLanguages(langs) == 'fr') {
				res.set('Content-Language', 'fr');
				res.send('Bien !' + suffix);
			} else {
				res.set('Content-Language', 'pt');
				res.send('Bem !' + suffix);
			}
		});
	});

	after(async () => {
		app.server.close();
		await servers.close();
	});

	beforeEach(() => {
		counters = {};
	});

	it("map testPath to mappedTestPath", async () => {
		const req = {
			port: ports.ngx,
			path: testPath
		};
		const reqm = {
			port: ports.ngx,
			path: mappedTestPath
		};
		let res = await common.get(req);
		const result = res.body.toString();

		res = await common.get(req);
		assert.equal(res.body.toString(), result);
		assert.equal(count(req), 1);
		assert.equal(res.headers['x-upcache-map'], mappedTestPath);

		res = await common.get(reqm);
		assert.equal(res.body.toString(), result);
		assert.equal(count(req), 1);
		assert.equal(res.headers['x-upcache-map'], mappedTestPath);
	});

	it("and Vary should map to two different keys", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testVary
		};
		let res;
		const english = "fr;q=0.8, en, pt";
		const french = "fr;q=0.8, en;q=0.7, pt;q=0.5";

		req.headers['Accept-Language'] = english;
		res = await common.get(req);
		assert.equal(res.headers.vary, 'Accept-Language, Sec-Purpose');
		assert.equal(res.headers['content-language'], 'en');
		assert.equal(res.headers['x-upcache-map'], mappedTestVary);
		assert.equal(count(req), 1);

		req.headers['Accept-Language'] = french;
		res = await common.get(req);
		assert.equal(res.headers.vary, 'Accept-Language, Sec-Purpose');
		assert.equal(res.headers['content-language'], 'fr');
		assert.equal(res.headers['x-upcache-map'], mappedTestVary);
		assert.equal(count(req), 2);

		req.headers['Sec-Purpose'] = 'prerender';
		res = await common.get(req);
		assert.equal(res.body.toString(), 'Bien !prerender');
		assert.equal(res.headers.vary, 'Accept-Language, Sec-Purpose');
		assert.equal(res.headers['content-language'], 'fr');
		assert.equal(res.headers['x-upcache-map'], mappedTestVary);
		assert.equal(count(req), 3);
		delete req.headers['Sec-Purpose'];

		req.headers['Accept-Language'] = english;
		res = await common.get(req);
		assert.equal(res.headers.vary, 'Accept-Language, Sec-Purpose');
		assert.equal(res.headers['content-language'], 'en');
		assert.equal(res.headers['x-upcache-map'], mappedTestVary);
		assert.equal(count(req), 3);

		req.headers['Accept-Language'] = french;
		res = await common.get(req);
		assert.equal(res.body.toString(), 'Bien !');
		assert.equal(res.headers.vary, 'Accept-Language, Sec-Purpose');
		assert.equal(res.headers['content-language'], 'fr');
		assert.equal(res.headers['x-upcache-map'], mappedTestVary);
		assert.equal(count(req), 3);

		req.headers['Sec-Purpose'] = 'prerender';
		res = await common.get(req);
		assert.equal(res.body.toString(), 'Bien !prerender');
		assert.equal(res.headers.vary, 'Accept-Language, Sec-Purpose');
		assert.equal(res.headers['content-language'], 'fr');
		assert.equal(res.headers['x-upcache-map'], mappedTestVary);
		assert.equal(count(req), 3);
		delete req.headers['Sec-Purpose'];

		req.headers['Accept-Language'] = "fr;q=0.8, en;q=0.9"; // another english
		res = await common.get(req);
		assert.equal(res.headers.vary, 'Accept-Language, Sec-Purpose');
		assert.equal(res.headers['content-language'], 'en');
		assert.equal(res.headers['x-upcache-map'], mappedTestVary);
		assert.equal(count(req), 4);

	});
});
