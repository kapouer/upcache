local common = require "upcache.common"
local console = common.console

local module = {}

local varyHeader = "Vary"

local function build_key(key, headers, list)
	local val
	local rval
	for name, map in pairs(list) do
		val = headers[name]
		if val ~= nil then
			rval = map[val]
			if rval ~= nil then
				key = name .. '->' .. rval .. ' ' .. key
			end
		end
	end
	return key
end

function module.get(key, vars, ngx)
	local list = common.get(common.variants, key, 'vary')
	if list == nil then
		return key
	end
	return build_key(key, ngx.req.get_headers(), list)
end

function module.set(key, vars, ngx)
	local headers = ngx.header
	local varies = common.parseHeader(headers[varyHeader])
	if varies == nil then
		return key
	end
	local list = common.get(common.variants, key, 'vary')
	if list == nil then
		list = {}
	end
	local val, rval, ok = false
	local rheaders = ngx.req.get_headers()
	local header
	for i, rheader in ipairs(varies) do
		if rheader == "Accept" then
			header = "Content-Type"
		elseif rheader:sub(1, 7) == "Accept-" then
			header = "Content-" .. rheader:sub(7)
		else
			header = rheader
		end
		console.info(rheader, " -> ", header)
		val = rheaders[rheader]
		rval = headers[header]
		if val ~= nil and rval ~= nil then
			map = list[rheader]
			if map == nil then
				map = {}
				list[rheader] = map
			end
			map[val] = rval
			ok = true
		end
	end
	if ok == false then
		return key
	end
	common.set(common.variants, key, list, 'vary')
	return build_key(key, rheaders, list)
end

return module;
