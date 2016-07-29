local jwt = require 'resty.jwt'
local cjson = require "cjson.safe"
local mp = require 'MessagePack'
local module = {}
local log = ngx.log
local ERR = ngx.ERR
local format = string.format

local HEADER_R = "X-Cache-Scope"
local HEADER_P = "X-Cache-Key-Handshake"

-- star is voluntarily removed from that pattern
local quotepattern = '(['..("%^$().[]+-?"):gsub("(.)", "%%%1")..'])'

local function quoteReg(str)
	return str:gsub(quotepattern, "%%%1")
end

local function authorize(restrictions, scopes)
	if restrictions == nil then return false end
	if scopes == nil then scopes = {[""]=true} end
	local failure = false
	local item, scope, scopeObj, mandatory, found
	-- array of granted scopes
	local grants = {}
	for i, label in pairs(restrictions) do
		mandatory = false
		found = false
		if label:sub(1, 1) == "&" then
			mandatory = true
			label = label:sub(2)
		end
		if label:find("%*") then
			regstr = "^" .. quoteReg(label):gsub('*', '.*') .. "$"
			for scope, scopeObj in pairs(scopes) do
				if scopeObj == true or scopeObj ~= nil and scopeObj.read == true then
					if scope:find(regstr) ~= nil then
						found = true
						table.insert(grants, scope)
						break
					end
				end
			end
		else
			scopeObj = scopes[label]
			if scopeObj == true or scopeObj ~= nil and scopeObj.read == true then
				found = true
				table.insert(grants, label)
			end
		end
		if mandatory and found == false then
			failure = true
			break
		end
	end
	if failure == true or #grants == 0 then
		return false
	end
	table.sort(grants)
	return grants
end

local function build_key(key, restrictions, scopes)
	local grants = authorize(restrictions, scopes)
	if grants == false then
		return key
	end
	local str = table.concat(grants, ',')
	if str:len() > 0 then key = str .. ' ' .. key end
	return key
end

local function get_restrictions(key)
	local pac = module.restrictions[key]
	if pac == nil then
		return nil
	end
	return mp.unpack(pac)
end

local function update_restrictions(key, data)
	module.restrictions[key] = mp.pack(data)
	return data
end

local function get_scopes(publicKey, bearer)
	if bearer == nil then return nil end
	local jwt_obj = jwt:load_jwt(bearer)
	local verified = jwt:verify_jwt_obj(publicKey, jwt_obj)
	if jwt_obj == nil or verified == false then
		log(ERR, "no valid jwt", json.encode(jwt_obj))
		return nil
	end
	if jwt_obj.payload then return jwt_obj.payload.scopes
	else return nil
	end
end

function module.get(key, vars)
	local bearer = vars.cookie_bearer
	if bearer == nil then
		return key
	end
	local publicKey = module.publicKeys[vars.host]
	if publicKey == nil then
		ngx.req.set_header(HEADER_P, "1")
		return key
	end
	return build_key(key, get_restrictions(key), get_scopes(publicKey, bearer))
end

function module.set(key, vars, headers)
	local publicKey = headers[HEADER_P]
	local host = vars.host
	if publicKey ~= nil then
		publicKey = ngx.unescape_uri(publicKey)
		headers[HEADER_P] = nil
		module.publicKeys[host] = publicKey
	else
		publicKey = module.publicKeys[host]
	end
	if publicKey == nil then
		return key
	end
	local restrictions = headers[HEADER_R];
	if restrictions == nil then return key end
	if type(restrictions) == "string" then
		restrictions = {restrictions}
	end
	update_restrictions(key, restrictions)
	return build_key(key, restrictions, get_scopes(publicKey, vars.cookie_bearer))
end

return module;

