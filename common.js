exports.prefixHeader = 'X-Upcache';

exports.replacements = function replacements(tag, params) {
	return tag.replace(/:(\w+)/g, function(str, name) {
		var val = params[name];
		if (val !== undefined) {
			return val;
		} else {
			return ':' + name;
		}
	});
};

