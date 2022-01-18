const URL = require('url');
const express = require('express');

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

	before((done) => {
		servers = runner(ports, done);

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

	after((done) => {
		app.server.close();
		servers.close(done);
	});

	it("should cache a url", () => {
		const req = {
			port: ports.ngx,
			path: testPath
		};
		return common.get(req).then((res) => {
			res.headers.should.have.property('x-upcache-tag', 'test');
			return common.get(req);
		}).then((res) => {
			res.headers.should.have.property('x-upcache-tag', 'test');
			count(req).should.equal(1);
		});
	});

	it("should honor req.params tag replacement", () => {
		const req = {
			port: ports.ngx,
			path: "/params/me"
		};
		return common.get(req).then((res) => {
			res.headers.should.have.property('x-upcache-tag', 'site-me');
			res.headers.should.have.property('cache-control', 'public, max-age=60');
			req.path = "/params/none";
			return common.get(req);
		}).then((res) => {
			res.headers.should.not.have.property('x-upcache-tag');
			res.headers.should.not.have.property('cache-control');
		});
	});

	it("should honor req.params tag replacement with a previous tag set", () => {
		const req = {
			port: ports.ngx,
			path: "/params2/me"
		};
		return common.get(req).then((res) => {
			res.headers.should.have.property('x-upcache-tag', 'prev, site-me');
			res.headers.should.have.property('cache-control', 'public, max-age=60');
			req.path = "/params2/none";
			return common.get(req);
		}).then((res) => {
			res.headers.should.have.property('x-upcache-tag', 'prev');
			res.headers.should.not.have.property('cache-control');
		});
	}).timeout(0);

	it("should invalidate a tag using a post", () => {
		let firstDate;
		const req = {
			port: ports.ngx,
			path: testPath
		};
		return common.get(req)
			.then((res) => {
				firstDate = Date.parse(res.body.date);
				res.headers.should.have.property('x-upcache-tag', 'test');
				return common.post(req, 'postbody');
			}).then((res) => {
				res.headers.should.have.property('x-upcache-tag', '+test');
				return common.get(req);
			}).then((res) => {
				Date.parse(res.body.date).should.be.greaterThan(firstDate);
			});
	});

	it("should invalidate one tag on a route with multiple tags using a post", () => {
		let firstDate;
		const req = {
			port: ports.ngx,
			path: "/multiple"
		};
		return common.get(req)
			.then((res) => {
				firstDate = Date.parse(res.body.date);
				res.headers.should.have.property('x-upcache-tag', 'one, two');
				return common.post(req, 'postbody');
			}).then((res) => {
				res.headers.should.have.property('x-upcache-tag', '+two');
				return common.get(req);
			}).then((res) => {
				Date.parse(res.body.date).should.be.greaterThan(firstDate);
			});
	});

	it("should invalidate a tag using a post to a different path", () => {
		let firstDate;
		const req = {
			port: ports.ngx,
			path: testPath
		};
		return common.get(req)
			.then((res) => {
				firstDate = Date.parse(res.body.date);
				res.headers.should.have.property('x-upcache-tag', 'test');
				return common.post({
					port: ports.ngx,
					path: "/a"
				}, 'postbody');
			}).then((res) => {
				res.headers.should.have.property('x-upcache-tag', '+test');
				return common.get(req);
			}).then((res) => {
				Date.parse(res.body.date).should.be.greaterThan(firstDate);
			});
	});

	it("should handle conditional requests from upstream ETag once cached", () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: conditionalPath
		};
		return common.get(req).then((res) => {
			res.headers.should.have.property('etag');
			headers['If-None-Match'] = res.headers.etag;
			return common.get(req);
		}).then((res) => {
			res.statusCode.should.equal(304);
			count(req).should.equal(1);
		});
	});

	it("should not let conditional requests go to upstream", () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: conditionalPathNot
		};
		headers['If-None-Match'] = 'W/"myetagnot"';
		return common.get(req).then((res) => {
			res.statusCode.should.equal(200);
			count(req).should.equal(1);
			return common.get(req);
		}).then((res) => {
			res.statusCode.should.equal(304);
			count(req).should.equal(1);
		});
	});

	it("should not cache responses if not tagged by upstream", () => {
		const headers = {};
		const req = {
			headers: headers,
			port: ports.ngx,
			path: untaggedPath
		};
		return common.get(req).then((res) => {
			res.statusCode.should.equal(200);
			count(req).should.equal(1);
			return common.get(req);
		}).then((res) => {
			res.statusCode.should.equal(200);
			count(req).should.equal(2);
		});
	});

	it("should not return multiple identical tags", () => {
		const req = {
			port: ports.ngx,
			path: '/multiplesame'
		};
		return common.get(req).then((res) => {
			res.headers.should.have.property('x-upcache-tag', '+one, two, three');
			return common.get(req);
		}).then((res) => {
			res.headers.should.have.property('x-upcache-tag', '+one, two, three');
			count(req).should.equal(1);
		});
	});
});
