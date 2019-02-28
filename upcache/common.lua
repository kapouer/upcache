local module = {}

local mp = require 'MessagePack'

local log = ngx.log
local ERR = ngx.ERR
local INFO = ngx.INFO
local json = require 'cjson.safe'

module.console = {}

function module.console.info(...)
	return log(INFO, ...)
end

function module.console.error(...)
	return log(ERR, ...)
end

function module.console.encode(...)
	return json.encode(...)
end

module.prefixHeader = "X-Upcache"

function module.parseHeader(obj)
	if obj == nil then
		return nil
	end
	if type(obj) == "string" then
		obj = {obj}
	end
	local list = {}
	for i, label in pairs(obj) do
		for str in string.gmatch(label, "[^,%s]+") do
			table.insert(list, str)
		end
	end
	return list
end

function module.get_variants(key, what)
	local pac = ngx.shared.upcacheVariants:get(key)
	if pac == nil then
		return nil
	end
	local unpac = mp.unpack(pac)
	if what ~= nil then
		unpac = unpac[what]
	end
	return unpac
end

function module.set_variants(key, what, data)
	local vars = module.get_variants(key)
	if vars == nil then
		vars = {}
	end
	vars[what] = data
	ngx.shared.upcacheVariants:set(key, mp.pack(vars))
	return vars
end

return module

