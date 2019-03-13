local common = require "upcache.common"
local console = common.console

local module = {}

local mapHeader = common.prefixHeader .. "-Map"

local function build_key(key, mapped_uri, uri)
	return key:sub(1, key:len() - uri:len()) ..  mapped_uri
end

function module.get(key, vars, ngx)
	local nkey = common.get(common.variants, key, 'map')
	if nkey == nil then
		return key
	else
		return nkey
	end
end

function module.set(key, vars, ngx)
	local mapped_uri = ngx.header[mapHeader]
	if mapped_uri == nil then
		return key
	end
	local nkey = build_key(key, mapped_uri, vars.request_uri)
	common.set(common.variants, key, nkey, 'map')
	return nkey
end

return module;
