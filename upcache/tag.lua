local mp = require 'MessagePack'
local module = {}
local log = ngx.log
local ERR = ngx.ERR
local format = string.format

local HEADER = "X-Cache-Tag"
-- monotonous version prefix - prevents key conflicts between nginx reboots
local MVP = ngx.time()

local function build_key(key, variants)
	if variants == nil then return key end
	local tags = variants.tags
	if tags == nil then	return key end
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

local function get_variants(key)
	local pac = ngx.shared.upcacheVariants:get(key)
	if pac == nil then
		return nil
	end
	return mp.unpack(pac)
end

local function update_variants(key, what, data)
	local vars = get_variants(key)
	if vars == nil then
		vars = {}
	end
	vars[what] = data
	ngx.shared.upcacheVariants:set(key, mp.pack(vars))
	return vars
end

function module.get(key)
	return build_key(key, get_variants(key))
end

function module.set(key, headers)
	local tags = headers[HEADER];
	if tags == nil then return key end
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
	local variants = update_variants(key, 'tags', tags)
	return build_key(key, variants)
end

return module;

