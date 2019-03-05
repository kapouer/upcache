var debug = require('debug')('upcache:map');

var common = require('./common');

var headerTag = common.prefixHeader + '-Map';

module.exports = function map(res, name, value) {
	res.set(headerTag, name + '=' + value);
};

