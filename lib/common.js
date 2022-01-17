exports.prefixHeader = 'X-Upcache';

exports.replacements = function replacements(tag, params) {
	return tag.replace(/:(\w+)/g, (str, name) => {
		const val = params[name];
		if (val !== undefined) {
			return val;
		} else {
			return ':' + name;
		}
	});
};

