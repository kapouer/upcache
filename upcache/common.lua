local module = {}

local mp = require 'MessagePack'

module.prefixHeader = "X-Upcache"

function module.get_variants(key, what)
	local pac = ngx.shared.upcacheVariants:get(key)
	if pac == nil then
		return nil
	end
	return mp.unpack(pac)[what]
end

function module.set_variants(key, what, data)
	local vars = get_variants(key)
	if vars == nil then
		vars = {}
	end
	vars[what] = data
	ngx.shared.upcacheVariants:set(key, mp.pack(vars))
	return vars
end

return module

