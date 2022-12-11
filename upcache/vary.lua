local common = require "upcache.common"
local console = common.console

local module = {}

local varyHeader = "Vary"

local function sortedIterator(t, f)
    local a = {}
    for n in pairs(t) do table.insert(a, n) end
    table.sort(a, f)
    local i = 0
    local iter = function ()
        i = i + 1
        if a[i] == nil then return nil
        else return a[i], t[a[i]]
        end
    end
    return iter
end

local function build_key(key, headers, list, vars)
	local resVal
	local reqVal
	for reqName, map in sortedIterator(list) do
		if reqName:sub(1, 9) == "X-Cookie-" then
			reqVal = vars['cookie_' .. reqName:sub(10)]
		else
			reqVal = headers[reqName] or "*"
		end
		resVal = map[reqVal]
		if resVal ~= nil then
			key = reqName .. '->' .. resVal .. ' ' .. key
		end
	end
	return key
end

function module.get(key, vars, ngx)
	local list = common.get(common.variants, key)['vary']
	if list == nil then
		return key
	end
	return build_key(key, ngx.req.get_headers(), list, vars)
end

function module.set(key, vars, ngx)
	local resHeaders = ngx.header
	local varies = common.parseHeader(resHeaders[varyHeader])
	if varies == nil then
		return key
	end
	local list = common.get(common.variants, key)['vary'] or {}
	local ok = false
	local reqHeaders = ngx.req.get_headers()
	local resName, resVal, reqName, reqVal
	for i, reqName in ipairs(varies) do
		if reqName == "Accept" then
			reqVal = reqHeaders[reqName] or "*"
			resName = "Content-Type"
		elseif reqName:sub(1, 7) == "Accept-" then
			reqVal = reqHeaders[reqName] or "*"
			resName = "Content-" .. reqName:sub(8)
		elseif reqName:sub(1, 9) == "X-Cookie-" then
			reqVal = vars['cookie_' .. reqName:sub(10)] or "*"
			resName = reqName
		else
			reqVal = reqHeaders[reqName] or "*"
			resName = reqName
		end

		resVal = resHeaders[resName] or "*"

		local map = list[reqName]
		if map == nil then
			map = {}
			list[reqName] = map
		end
		map[reqVal] = resVal
		ok = true
	end
	if ok == false then
		return key
	end
	common.set(common.variants, key, list, 'vary')
	return build_key(key, reqHeaders, list, vars)
end

return module;

