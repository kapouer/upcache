var common = require('./common');

var headerTag = common.prefixHeader + '-Map';

module.exports = function map(res, uri) {
	res.set(headerTag, uri);
};

