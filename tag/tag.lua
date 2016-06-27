local mp = require 'MessagePack'
local module = {}
local log = ngx.log
local ERR = ngx.ERR
local format = string.format

module._VERSION = '0.0.1'

local HEADER = "X-Cache-Tag"

local function explode(str, pat)
	local t = {}  -- NOTE: use {n = 0} in Lua-5.0
	local fpat = "(.-)" .. pat
	local last_end = 1
	local s, e, cap = str:find(fpat, 1)
	while s do
		if s ~= 1 or cap ~= "" then
			table.insert(t,cap)
		end
		last_end = e+1
		s, e, cap = str:find(fpat, last_end)
	end
	if last_end <= #str then
		cap = str:sub(last_end)
		table.insert(t, cap)
	end
	return t
end

local function build_key(key, variants)
	if variants == nil then return key end
	local tags = variants.tags
	if tags == nil then	return key end
	local nkey = key
	local mtags = module.tags
	local tagval
	for i, tag in pairs(tags) do
		tagval = mtags[tag]
		if tagval == nil then tagval = 0 end
		nkey = tag .. '=' .. tagval .. ' ' .. nkey
	end
	ngx.req.set_header(HEADER, table.concat(tags, ','))
	return nkey
end

local function get_variants(key)
	local pac = module.variants[key]
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
	module.variants[key] = mp.pack(vars)
	return vars
end

function module.get(key)
	return build_key(key, get_variants(key))
end

function module.set(key, headers)
	local header = headers[HEADER];
	if header == nil then return end
	local tags = explode(header, ',')
	local mtags = module.tags
	local tagval
	for i, tag in pairs(tags) do
		if (tag:sub(1,1) == '+') then
			tag = tag:sub(2)
			tags[i] = tag
			tagval = mtags[tag]
			if tagval == nil then tagval = 0 end
			mtags[tag] = tagval + 1
		end
	end
	local variants = update_variants(key, 'tags', tags)
	return build_key(key, variants)
end

return module;

