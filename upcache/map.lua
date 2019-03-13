local common = require "upcache.common"
local console = common.console

local module = {}

local mapHeader = common.prefixHeader .. "-Map"

function module.get(key, ngx)
	local nkey = common.get(common.variants, key, 'map')
	if nkey == nil then
		return key
	else
		return nkey
	end
end

function module.set(key, ngx)
	local mapped_uri = ngx.header[mapHeader]
	if mapped_uri == nil
		then return key
	end
	local nkey = key:sub(1, key:len() - ngx.var.request_uri:len()) ..  mapped_uri
	common.set(common.variants, key, nkey, 'map')
	return nkey
end

return module;
