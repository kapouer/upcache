local common = require "upcache.common"
local console = common.console

local module = {}

local varyHeader = "Vary"

local function build_key(key, headers, list)
	local resVal
	local reqVal
	for reqName, map in pairs(list) do
		reqVal = headers[reqName]
		if reqVal ~= nil then
			resVal = map[reqVal]
			if resVal ~= nil then
				key = reqName .. '->' .. resVal .. ' ' .. key
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
	local resHeaders = ngx.header
	local varies = common.parseHeader(resHeaders[varyHeader])
	if varies == nil then
		return key
	end
	local list = common.get(common.variants, key, 'vary')
	if list == nil then
		list = {}
	end
	local ok = false
	local reqHeaders = ngx.req.get_headers()
	local resName, resVal, reqName, reqVal
	for i, reqName in ipairs(varies) do
		if reqName == "Accept" then
			resName = "Content-Type"
		elseif reqName:sub(1, 7) == "Accept-" then
			resName = "Content-" .. reqName:sub(8)
		else
			resName = reqName
		end
		reqVal = reqHeaders[reqName]
		resVal = resHeaders[resName]
		if resVal ~= nil and reqVal ~= nil then
			map = list[reqName]
			if map == nil then
				map = {}
				list[reqName] = map
			end
			map[reqVal] = resVal
			ok = true
		end
	end
	if ok == false then
		return key
	end
	common.set(common.variants, key, list, 'vary')
	return build_key(key, reqHeaders, list)
end

return module;
