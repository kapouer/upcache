var debug = require('debug')('upcache:vary');

var common = require('./common');

var headerTag = common.prefixHeader + '-Vary';

module.exports = function map(res, name, value) {
	res.set(headerTag, name + '=' + value);
};

