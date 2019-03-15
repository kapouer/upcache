var debug = require('debug')('vary');
var should = require('should');
var fs = require('fs');
var URL = require('url');
var express = require('express');

var runner = require('../lib/spawner');
var common = require('./common');

var tag = require('..').tag;

var ports = {
	app: 3000,
	ngx: 3001,
	memc: 3002
};

describe("Vary", function suite() {
	var servers, app;
	var testPath = '/vary-test';
	var testNegotiation = '/nego';
	var testLanguage = "/lang";
	var testMulti = "/multi";
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
			res.vary('User-Agent');
			res.set('User-Agent', req.get('user-agent').includes('Firefox') ? 1 : 2);
			count(req, 1);
			res.send({
				value: (req.path || '/').substring(1),
				date: new Date()
			});
		});

		app.get(testNegotiation, tag('app'), function(req, res, next) {
			res.vary('Accept');
			count(req, 1);
			if (req.accepts('xml')) {
				res.type('application/xml');
				res.send('<xml></xml>');
			} else if (req.accepts('json')) {
				res.json({xml: true});
			}
		});

		app.get(testLanguage, tag('app'), function(req, res, next) {
			res.vary('Accept-Language');
			count(req, 1);
			var langs = ['en', 'fr'];
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

		app.get(testMulti, tag('app'), function(req, res, next) {
			res.vary('Accept-Language').vary('Accept');
			count(req, 1);
			var langs = ['en', 'fr'];
			var str = "Bad";
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

	after(function(done) {
		app.server.close();
		servers.close(done);
	});

	beforeEach(function() {
		counters = {};
	});

	it("should vary upon two groups of user-agent", function() {
		var agent1 = 'Mozilla/5.0 (Android 4.4; Mobile; rv:41.0) Gecko/41.0 Firefox/41.0';
		var agent2 = 'Mozilla/5.0 (Android 4.4; Mobile; rv:41.0) Gecko/41.0 Firefox/42.0';
		var agent3 = 'Mozilla/5.0';
		var headers = {
			'User-Agent': agent1
		};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testPath
		};
		return common.get(req).then(function() {
			headers['User-Agent'] = agent2;
			return common.get(req);
		}).then(function(res) {
			count(req).should.equal(2);
			res.headers.should.have.property('vary', 'Accept-Encoding, User-Agent');
			res.headers.should.have.property('user-agent', '1');
			headers['User-Agent'] = agent1;
			return common.get(req);
		}).then(function(res) {
			count(req).should.equal(2);
			res.headers.should.have.property('vary', 'Accept-Encoding, User-Agent');
			res.headers.should.have.property('user-agent', '1');
			headers['User-Agent'] = agent2;
			return common.get(req);
		}).then(function(res) {
			res.headers.should.have.property('vary', 'Accept-Encoding, User-Agent');
			res.headers.should.have.property('user-agent', '1');
			count(req).should.equal(2);
			headers['User-Agent'] = agent3;
			return common.get(req);
		}).then(function(res) {
			res.headers.should.have.property('vary', 'Accept-Encoding, User-Agent');
			res.headers.should.have.property('user-agent', '2');
			count(req).should.equal(3);
		});
	});

	it("should vary upon Accept, Content-Type", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testNegotiation
		};
		req.headers.Accept = "application/xml";
		return common.get(req).then(function() {
			req.headers.Accept = "application/json";
			return common.get(req);
		}).then(function(res) {
			count(req).should.equal(2);
			res.headers.should.have.property('vary', 'Accept');
			res.headers.should.have.property('content-type', 'application/json; charset=utf-8');
			req.headers.Accept = "application/xml";
			return common.get(req);
		}).then(function(res) {
			count(req).should.equal(2);
			res.headers.should.have.property('vary', 'Accept');
			res.headers.should.have.property('content-type', 'application/xml; charset=utf-8');
			return common.get(req);
		}).then(function(res) {
			res.headers.should.have.property('vary', 'Accept');
			res.headers.should.have.property('content-type', 'application/xml; charset=utf-8');
			count(req).should.equal(2);
			req.headers.Accept = "application/json";
			return common.get(req);
		}).then(function(res) {
			res.headers.should.have.property('vary', 'Accept');
			res.headers.should.have.property('content-type', 'application/json; charset=utf-8');
			count(req).should.equal(2);
		});
	});

	it("should vary upon Accept-Language, Content-Language", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testLanguage
		};
		var english = "fr;q=0.8, en, pt";
		var french = "fr;q=0.8, en;q=0.7, pt;q=0.5";
		req.headers['Accept-Language'] = english;
		return common.get(req).then(function(res) {
			res.headers.should.have.property('vary', 'Accept-Language');
			res.headers.should.have.property('content-language', 'en');
			req.headers['Accept-Language'] = french;
			return common.get(req);
		}).then(function(res) {
			count(req).should.equal(2);
			res.headers.should.have.property('vary', 'Accept-Language');
			res.headers.should.have.property('content-language', 'fr');
			req.headers['Accept-Language'] = english;
			return common.get(req);
		}).then(function(res) {
			count(req).should.equal(2);
			res.headers.should.have.property('vary', 'Accept-Language');
			res.headers.should.have.property('content-language', 'en');
			req.headers['Accept-Language'] = french;
			return common.get(req);
		}).then(function(res) {
			res.headers.should.have.property('vary', 'Accept-Language');
			res.headers.should.have.property('content-language', 'fr');
			count(req).should.equal(2);
			req.headers['Accept-Language'] = "fr;q=0.8, en;q=0.9"; // another english
			return common.get(req);
		}).then(function(res) {
			res.headers.should.have.property('vary', 'Accept-Language');
			res.headers.should.have.property('content-language', 'en');
			count(req).should.equal(3);
		});
	});

	it("should vary upon Accept-Language and Accept", function() {
		var headers = {};
		var req = {
			headers: headers,
			port: ports.ngx,
			path: testMulti
		};
		var english = "fr;q=0.8, en, pt";
		var french = "fr;q=0.8, en;q=0.7, pt;q=0.5";
		req.headers['Accept-Language'] = english;
		req.headers.Accept = "application/json";

		return common.get(req).then(function(res) {
			res.headers.should.have.property('vary', 'Accept-Language, Accept');
			res.headers.should.have.property('content-language', 'en');
			res.headers.should.have.property('content-type', 'application/json; charset=utf-8');
			req.headers['Accept-Language'] = french;
			return common.get(req);
		}).then(function(res) {
			count(req).should.equal(2);
			res.headers.should.have.property('vary', 'Accept-Language, Accept');
			res.headers.should.have.property('content-language', 'fr');
			res.headers.should.have.property('content-type', 'application/json; charset=utf-8');
			req.headers['Accept-Language'] = english;
			return common.get(req);
		}).then(function(res) {
			count(req).should.equal(2);
			res.headers.should.have.property('vary', 'Accept-Language, Accept');
			res.headers.should.have.property('content-language', 'en');
			res.headers.should.have.property('content-type', 'application/json; charset=utf-8');
			req.headers.Accept = "application/xml";
			return common.get(req);
		}).then(function(res) {
			res.headers.should.have.property('vary', 'Accept-Language, Accept');
			res.headers.should.have.property('content-language', 'en');
			res.headers.should.have.property('content-type', 'application/xml; charset=utf-8');
			count(req).should.equal(3);
			req.headers['Accept-Language'] = french;
			req.headers.Accept = "application/json";
			return common.get(req);
		}).then(function(res) {
			res.headers.should.have.property('vary', 'Accept-Language, Accept');
			res.headers.should.have.property('content-language', 'fr');
			res.headers.should.have.property('content-type', 'application/json; charset=utf-8');
			count(req).should.equal(3);
		});
	});
});
