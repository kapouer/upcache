var spawn = require('child_process').spawn;
var express = require('express');
var cache = require('../version');

var app = express();

var memc = spawn('memcached', ['-v', '-p', '3033']);
memc.stdout.pipe(process.stdout);
memc.stderr.pipe(process.stderr);

var nginx = spawn('/usr/sbin/nginx', [
	'-p', __dirname, '-c', 'nginx.conf'
]);
nginx.stdout.pipe(process.stdout);
nginx.stderr.pipe(process.stderr);

app.use(cache);

app.get('*', function(req, res, next) {
	console.log("GET");
	res.send({
		date: new Date()
	});
});

app.post('*', function(req, res, next) {
	console.log("POST");
	res.send('OK');
});

app.listen(3032, function() {
console.log(arguments);
	console.log("http://localhost:3032");
});
