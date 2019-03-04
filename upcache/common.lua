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

function module.console.encode(obj)
	if obj == nil then
		return "null"
	end
	return json.encode(obj)
end

module.prefixHeader = "X-Upcache"
module.variants = "upcacheVariants"

function module.parseHeader(obj)
	if obj == nil then
		return nil
	end
	if type(obj) == "string" then
		obj = {obj}
	end
	local list = {}
	for i, label in ipairs(obj) do
		for str in string.gmatch(label, "[^,%s]+") do
			table.insert(list, str)
		end
	end
	return list
end

function module.get(dict, key, what)
	local pac = ngx.shared[dict]:get(key)
	if pac == nil then
		if what == nil then
			return {}
		else
			return nil
		end
	end
	local unpac = mp.unpack(pac)
	if what ~= nil then
		unpac = unpac[what]
	end
	return unpac
end

function module.set(dict, key, data, what)
	local vars
	if what ~= nil then
		vars = module.get(dict, key)
		if vars == nil then
			vars = {}
		end
		vars[what] = data
	else
		vars = data
	end
	ngx.shared[dict]:set(key, mp.pack(vars))
	return vars
end

return module

