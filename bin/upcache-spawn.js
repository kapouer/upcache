#!/usr/bin/node

var dash = require('dashdash');

var spawner = require('../spawner');

var parser = dash.createParser({options: [
	{
		names: ['help', 'h'],
		type: 'bool',
		help: 'Print this help and exit.'
	},
	{
		names: ['ngx'],
		type: 'number',
		default: 3001,
		help: 'nginx port number'
	},
	{
		names: ['memc'],
		type: 'number',
		default: 3002,
		help: 'memcached port number'
	},
	{
		names: ['app'],
		type: 'number',
		default: 3000,
		help: 'app port number (for nginx upstream config)'
	},
	{
		names: ['grep', 'g'],
		type: 'string',
		help: 'filter output by pattern'
	}
]});

var opts;
try {
	opts = parser.parse(process.argv);
} catch(e) {
	console.error(e.toString());
	opts = {help: true};
}

if (opts.help) {
	var help = parser.help({includeEnv: true}).trimRight();
	console.log('usage: node foo.js [OPTIONS]\n' + 'options:\n' + help);
	process.exit(0);
}

if (opts.ngx != 3001) console.warn("Only nginx on port 3001 is supported");
opts.ngx = 3001;
if (opts.app != 3000) console.warn("Only app on port 3000 is supported");
opts.app = 3000;

var servers = spawner(opts, function(err) {
	if (err) console.error(err);
	if (servers.memcached) console.log("Started memcached on port", opts.memc);
	if (servers.nginx) console.log("Started nginx on port", opts.ngx);
	console.log("Upstream app expected on port", opts.app);
});

