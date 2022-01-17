exports.prefixHeader = 'X-Upcache';

exports.replacements = function replacements(tag, params) {
	let hit = false;
	const str = tag.replace(/:(\w+)/g, (str, name) => {
		let val = params[name];
		if (val != null) {
			hit = true;
		} else {
			val = '';
		}
		return val;
	});
	if (hit) return str;
	else return null;
};
