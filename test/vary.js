const URL = require('url');
const express = require('express');
const cookie = require('cookie');

const runner = require('../lib/spawner');
const common = require('./common');

const tag = require('..').tag;

const ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Vary", () => {
	let servers, app;
	const testPath = '/vary-test';
	const testCookie = '/vary-test-cookie';
	const testNegotiation = '/nego';
	const testLanguage = "/lang";
	const testMulti = "/multi";
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
			res.vary('User-Agent');
			res.set('User-Agent', req.get('user-agent').includes('Firefox') ? 1 : 2);
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testCookie, tag('app'), (req, res, next) => {
			const { Prerender } = cookie.parse(req.headers.cookie || "") || {};
			res.vary('X-Cookie-Prerender');
			if (Prerender != null) {
				res.set('X-Cookie-Prerender', Prerender == "on" ? 'true' : 'false');
			}
			count(req, 1);
			res.send({
				value: Prerender
			});
		});

		app.get(testNegotiation, tag('app'), (req, res, next) => {
			res.vary('Accept');
			count(req, 1);
			if (req.accepts(['xml', 'html']) == 'xml') {
				res.type('application/xml');
				res.send('<xml></xml>');
			} else if (req.accepts('json')) {
				res.json({xml: true});
			} else {
				res.sendStatus(406);
			}
		});

		app.get(testLanguage, tag('app'), (req, res, next) => {
			res.vary('Accept-Language');
			count(req, 1);
			const langs = ['en', 'fr'];
			if (req.acceptsLanguages(langs) == 'en') {
				res.set('Content-Language', 'en');
				res.send('Good !');
			} else if (req.acceptsLanguages(langs) == 'fr') {
				res.set('Content-Language', 'fr');
				res.send('Bien !');
			} else {
				res.set('Content-Language', 'pt');
				res.send('Bem !');
			}
		});

		app.get(testMulti, tag('app'), (req, res, next) => {
			res.vary('Accept-Language');
			res.append('Vary', 'Accept');
			count(req, 1);
			const langs = ['en', 'fr'];
			let str = "Bad";
			if (req.acceptsLanguages(langs) == 'en') {
				res.set('Content-Language', 'en');
				str = "Good";
			} else if (req.acceptsLanguages(langs) == 'fr') {
				res.set('Content-Language', 'fr');
				str = "Bien";
			}
			if (req.accepts('xml')) {
				res.type('application/xml');
				res.send(`<xml>${str}</xml>`);
			} else if (req.accepts('json')) {
				res.json({xml: str});
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

	it("should vary upon two groups of user-agent", async () => {
		const agent1 = 'Mozilla/5.0 (Android 4.4; Mobile; rv:41.0) Gecko/41.0 Firefox/41.0';
		const agent2 = 'Mozilla/5.0 (Android 4.4; Mobile; rv:41.0) Gecko/41.0 Firefox/42.0';
		const agent3 = 'Mozilla/5.0';
		const headers = {
			'User-Agent': agent1
		};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testPath
		};
		let res = await common.get(req);
		headers['User-Agent'] = agent2;
		res = await common.get(req);

		count(req).should.equal(2);
		res.headers.should.have.property('vary', 'Accept-Encoding, User-Agent');
		res.headers.should.have.property('user-agent', '1');
		headers['User-Agent'] = agent1;
		res = await common.get(req);

		count(req).should.equal(2);
		res.headers.should.have.property('vary', 'Accept-Encoding, User-Agent');
		res.headers.should.have.property('user-agent', '1');
		headers['User-Agent'] = agent2;
		res = await common.get(req);

		res.headers.should.have.property('vary', 'Accept-Encoding, User-Agent');
		res.headers.should.have.property('user-agent', '1');
		count(req).should.equal(2);
		headers['User-Agent'] = agent3;
		res = await common.get(req);

		res.headers.should.have.property('vary', 'Accept-Encoding, User-Agent');
		res.headers.should.have.property('user-agent', '2');
		count(req).should.equal(3);
	});

	it("should vary upon Accept, Content-Type", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testNegotiation
		};
		let res = await common.get(req);
		count(req).should.equal(1);
		res = await common.get(req);

		count(req).should.equal(1);
		req.headers.Accept = "application/json";
		res = await common.get(req);

		res.headers.should.have.property('vary', 'Accept');
		res.headers.should.have.property('content-type', 'application/json; charset=utf-8');
		count(req).should.equal(2);
		req.headers.Accept = "text/plain";
		res = await common.get(req);

		res.statusCode.should.equal(406);
		count(req).should.equal(3);
		req.headers.Accept = "application/xml";
		res = await common.get(req);

		res.headers.should.have.property('vary', 'Accept');
		res.headers.should.have.property('content-type', 'application/xml; charset=utf-8');
		count(req).should.equal(4);
		res = await common.get(req);

		res.headers.should.have.property('vary', 'Accept');
		res.headers.should.have.property('content-type', 'application/xml; charset=utf-8');
		count(req).should.equal(4);
		req.headers.Accept = "application/json";
		res = await common.get(req);

		res.headers.should.have.property('vary', 'Accept');
		res.headers.should.have.property('content-type', 'application/json; charset=utf-8');
		count(req).should.equal(4);
	});

	it("should vary upon Accept-Language, Content-Language", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testLanguage
		};
		const english = "fr;q=0.8, en, pt";
		const french = "fr;q=0.8, en;q=0.7, pt;q=0.5";
		req.headers['Accept-Language'] = english;
		let res = await common.get(req);
		res.headers.should.have.property('vary', 'Accept-Language');
		res.headers.should.have.property('content-language', 'en');
		req.headers['Accept-Language'] = french;
		res = await common.get(req);

		count(req).should.equal(2);
		res.headers.should.have.property('vary', 'Accept-Language');
		res.headers.should.have.property('content-language', 'fr');
		req.headers['Accept-Language'] = english;
		res = await common.get(req);

		count(req).should.equal(2);
		res.headers.should.have.property('vary', 'Accept-Language');
		res.headers.should.have.property('content-language', 'en');
		req.headers['Accept-Language'] = french;
		res = await common.get(req);

		res.headers.should.have.property('vary', 'Accept-Language');
		res.headers.should.have.property('content-language', 'fr');
		count(req).should.equal(2);
		req.headers['Accept-Language'] = "fr;q=0.8, en;q=0.9"; // another english
		res = await common.get(req);

		res.headers.should.have.property('vary', 'Accept-Language');
		res.headers.should.have.property('content-language', 'en');
		count(req).should.equal(3);
	});

	it("should vary upon Accept-Language and Accept", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testMulti
		};
		const english = "fr;q=0.8, en, pt";
		const french = "fr;q=0.8, en;q=0.7, pt;q=0.5";
		req.headers['Accept-Language'] = english;
		req.headers.Accept = "application/json";

		let res = await common.get(req);
		res.headers.should.have.property('vary', 'Accept-Language, Accept');
		res.headers.should.have.property('content-language', 'en');
		res.headers.should.have.property('content-type', 'application/json; charset=utf-8');
		req.headers['Accept-Language'] = french;
		res = await common.get(req);

		count(req).should.equal(2);
		res.headers.should.have.property('vary', 'Accept-Language, Accept');
		res.headers.should.have.property('content-language', 'fr');
		res.headers.should.have.property('content-type', 'application/json; charset=utf-8');
		req.headers['Accept-Language'] = english;
		res = await common.get(req);

		count(req).should.equal(2);
		res.headers.should.have.property('vary', 'Accept-Language, Accept');
		res.headers.should.have.property('content-language', 'en');
		res.headers.should.have.property('content-type', 'application/json; charset=utf-8');
		req.headers.Accept = "application/xml";
		res = await common.get(req);

		res.headers.should.have.property('vary', 'Accept-Language, Accept');
		res.headers.should.have.property('content-language', 'en');
		res.headers.should.have.property('content-type', 'application/xml; charset=utf-8');
		count(req).should.equal(3);
		req.headers['Accept-Language'] = french;
		req.headers.Accept = "application/json";
		res = await common.get(req);

		res.headers.should.have.property('vary', 'Accept-Language, Accept');
		res.headers.should.have.property('content-language', 'fr');
		res.headers.should.have.property('content-type', 'application/json; charset=utf-8');
		count(req).should.equal(3);
	});


	it("should vary on Cookie Name", async () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: testCookie
		};

		req.headers['Cookie'] = 'IgnoreMe=1; DNT=1; Prerender=on';
		let res = await common.get(req);
		res.headers.should.have.property('vary', 'X-Cookie-Prerender');
		res.headers.should.have.property('x-cookie-prerender', 'true');
		req.headers['Cookie'] = 'IgnoreMe=1; DNT=1; Prerender=off';
		res = await common.get(req);

		count(req).should.equal(2);
		res.headers.should.have.property('vary', 'X-Cookie-Prerender');
		res.headers.should.have.property('x-cookie-prerender', 'false');
		req.headers['Cookie'] = 'IgnoreMe=1; DNT=1; Prerender=on';
		res = await common.get(req);

		count(req).should.equal(2);
		res.headers.should.have.property('vary', 'X-Cookie-Prerender');
		res.headers.should.have.property('x-cookie-prerender', 'true');
		req.headers['Cookie'] = 'IgnoreMe=1; DNT=1; Prerender=off';
		res = await common.get(req);

		count(req).should.equal(2);
		res.headers.should.have.property('vary', 'X-Cookie-Prerender');
		res.headers.should.have.property('x-cookie-prerender', 'false');
		req.headers['Cookie'] = 'IgnoreMe=1; DNT=1';
		res = await common.get(req);

		res.headers.should.have.property('vary', 'X-Cookie-Prerender');
		res.headers.should.not.have.property('x-cookie-prerender');
		count(req).should.equal(3);
	});
});
