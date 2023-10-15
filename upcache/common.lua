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

function module.headerList(obj)
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

function module.headerString(obj)
	if obj == nil then
		return nil
	elseif type(obj) == "string" then
		return obj
	else
		return table.concat(obj, ', ')
	end
end

function module.get(dict, key)
	local pac = ngx.shared[dict]:get(key)
	if pac == nil then
		return {}
	end
	return mp.unpack(pac)
end

function module.set(dict, key, data, what)
	local vars
	if what ~= nil then
		vars = module.get(dict, key)
		vars[what] = data
	else
		vars = data
	end
	ngx.shared[dict]:set(key, mp.pack(vars))
	return vars
end

return module

