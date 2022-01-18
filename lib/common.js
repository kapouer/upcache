exports.prefixHeader = 'X-Upcache';

exports.replacements = function replacements(tag, params) {
	let someNull = false;
	const str = tag.replace(/:(\w+)/g, (str, name) => {
		const val = params[name];
		if (val == null) {
			someNull = true;
		} else {
			return val;
		}
	});
	if (!someNull) return str;
	else return null;
};
