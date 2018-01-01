local common = require "upcache.common"
local console = common.console

local module = {}

local tagHeader = common.prefixHeader .. "-Tag"
-- monotonous version prefix - prevents key conflicts between nginx reboots
local MVP = ngx.time()

local function build_key(key, tags)
	if tags == nil then return key end
	local nkey = key
	local mtags = ngx.shared.upcacheTags
	local tagval
	for i, tag in pairs(tags) do
		tagval = mtags:get(tag)
		if tagval == nil then tagval = MVP end
		nkey = tag .. '=' .. tagval .. ' ' .. nkey
	end
	return nkey
end

function module.get(key)
	return build_key(key, common.get_variants(key, 'tags'))
end

function module.set(key, headers)
	local tags = headers[tagHeader];
	if tags == nil then return nil end
	if type(tags) ~= "table" then
		tags = {tags}
	end
	local mtags = ngx.shared.upcacheTags
	local tagval
	for i, tag in pairs(tags) do
		if (tag:sub(1,1) == '+') then
			tag = tag:sub(2)
			tags[i] = tag
			tagval = mtags:get(tag)
			if tagval == nil then
				tagval = MVP
			end
			mtags:set(tag, tagval + 1)
		end
	end
	table.sort(tags)
	common.set_variants(key, 'tags', tags)
	return build_key(key, tags)
end

return module;

