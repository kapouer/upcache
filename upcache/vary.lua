local common = require "upcache.common"
local console = common.console

local module = {}

local varyHeader = common.prefixHeader .. "-Vary"

local function build_key(key, headers, maps)
	local val, hash
	for name, map in pairs(maps) do
		val = headers[name]
		if val ~= nil then
			hash = map[val]
			if hash ~= nil then
				key = name .. '->' .. hash .. ' ' .. key
			end
		end
	end
	return key
end

function module.get(key, ngx)
	local maps = common.get(common.variants, key, 'vary')
	if maps == nil then
		return key
	end
	return build_key(key, ngx.req.get_headers(), maps)
end

function module.set(key, ngx)
	local header = ngx.header[varyHeader]
	if header == nil
		then return key
	end
	local name, hash = header:match("^([^=]+)=([^=]+)$")
	local val = ngx.var['http_' .. name:gsub('-', '_'):lower()]
	if val == nil then
		return key
	end
	local maps = common.get(common.variants, key, 'vary')
	if maps == nil then
		maps = {}
	end
	local map = maps[name]
	if map == nil then
		map = {}
		maps[name] = map
	end
	map[val] = hash
	common.set(common.variants, key, maps, 'vary')
	return build_key(key, ngx.req.get_headers(), maps)
end

return module;
