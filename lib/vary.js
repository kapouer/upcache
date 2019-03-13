var common = require('./common');

var headerTag = common.prefixHeader + '-Vary';

module.exports = function vary(res, name, value) {
	res.set(headerTag, name + '=' + value);
};

