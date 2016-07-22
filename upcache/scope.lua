--package.path = package.path .. ";/usr/local/share/lua/5.1/"

local jwt = require 'resty.jwt'
local json = require 'json'
local mp = require 'MessagePack'
local module = {}
local log = ngx.log
local ERR = ngx.ERR
local format = string.format

module._VERSION = '0.0.1'

local HEADER_R = "X-Cache-Restriction"
local HEADER_P = "X-Cache-Key-Handshake"

local function authorize(restrictions, scopes)
	local failure = false
	local grant, scope, mandatory
	local grants = {}
	if restrictions == nil then return false end
	for i, label in pairs(restrictions) do
		grant = label
		if label == "*" then
			table.insert(grants, grant)
			goto continue
		end
		if scopes == nil then goto continue end
		mandatory = false
		if label:sub(1, 1) == "&" then
			mandatory = true
			label = label:sub(2)
		end
		regstr = label:gsub('*', '.*')
		if regstr:len() ~= label:len() then
			regstr = "^" .. regstr .. "$"
			for scope, scopeObj in pairs(scopes) do
				if scopeObj == true or scopeObj ~= nil and scopeObj.read == true then
					if regstr:match(scope) then
						table.insert(grants, grant)
						goto continue
					end
				end
			end
		else
			scope = scopes[label]
			if scope == true or scope ~= nil and scope.read == true then
				table.insert(grants, grant)
				goto continue
			end
		end
		if mandatory then
			failure = true
			break
		end
		::continue::
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
	key = table.concat(grants, ',') .. ' ' .. key
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
		module.publicKeys[host] = publicKey
	else
		publicKey = module.publicKeys[host]
	end
	if publicKey == nil then
		return key
	end
	local restrictions = headers[HEADER_R];
	if restrictions == nil then return end
	if type(restrictions) == "string" then
		restrictions = {restrictions}
	end
	update_restrictions(key, restrictions)
	return build_key(key, restrictions, get_scopes(publicKey, vars.cookie_bearer))
end

return module;

