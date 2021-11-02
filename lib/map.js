const common = require('./common');

const headerTag = common.prefixHeader + '-Map';

module.exports = function map(res, uri) {
	res.set(headerTag, uri);
};

