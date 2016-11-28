exports.prefixHeader = 'X-Upcache';

exports.replacements = function replacements(tag, params, char) {
	return tag.replace(/:(\w+)/g, function(str, name) {
		var val = params[name];
		if (val !== undefined) {
			if (char !== undefined) return char;
			else return val;
		} else {
			return ':' + name;
		}
	});
};

