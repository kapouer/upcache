#!/usr/bin/node

const dash = require('dashdash');

const spawner = require('../lib/spawner');

const parser = dash.createParser({options: [
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

let opts;
try {
	opts = parser.parse(process.argv);
} catch(e) {
	console.error(e.toString());
	opts = {help: true};
}

if (opts.help) {
	const help = parser.help({includeEnv: true}).trimEnd();
	console.info('usage: node foo.js [OPTIONS]\n' + 'options:\n' + help);
	process.exit(0);
}

if (opts.ngx != 3001) console.warn("Only nginx on port 3001 is supported");
opts.ngx = 3001;
if (opts.app != 3000) console.warn("Only app on port 3000 is supported");
opts.app = 3000;

spawner(opts).then(servers => {
	if (servers.memcached) console.info("Started memcached on port", opts.memc);
	if (servers.nginx) console.info("Started nginx on port", opts.ngx);
	console.info("Upstream app expected on port", opts.app);
}).catch(err => {
	console.error(err);
});

