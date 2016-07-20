var onHeaders = require('on-headers');

module.exports = cacheTagMw;

// TODO
// app.get('/mypage', cache.tag('zoneA'), mw)
// app.get('/mysection/:myparam'), cache.tag(':myparam'), mw)

function cacheTagMw(req, res, next) {
	onHeaders(res, function() {
		if (res.statusCode >= 200 && res.statusCode < 300) {
			var tags = req.get('X-Cache-Tag');
			tags = tags && tags.split(',') || [];
			var rtags = res._headers['x-cache-tag'];
			(rtags && rtags.split(',') || []).forEach(function(tag) {
				if (!~tags.indexOf(tag)) tags.push(tag);
			});

			if (req.method != "GET") tags = tags.map(function(tag) {
				return '+' + tag;
			});
			if (tags.length) res.set('X-Cache-Tag', tags);
		}
	});
	next();
}

