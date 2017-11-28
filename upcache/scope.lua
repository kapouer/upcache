local jwt = require 'resty.jwt'
local validators = require "resty.jwt-validators"

local common = require 'upcache.common'
local console = common.console

local module = {}

local scopeHeader = common.prefixHeader .. "-Scope"
local handshakeHeader = common.prefixHeader .. "-Key-Handshake"

-- star is voluntarily removed from that pattern
local quotepattern = '(['..("%^$().[]+-?"):gsub("(.)", "%%%1")..'])'

local function quoteReg(str)
	return str:gsub(quotepattern, "%%%1")
end

local function logKey(from, what, key, data)
	if string.find(key, quoteReg(what) .. "$") == nil then return end
	console.info(from, " ", key, console.encode(data))
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
	return common.get_variants(key, 'restrictions')
end

local function update_restrictions(key, data)
	common.set_variants(key, 'restrictions', data)
	return data
end

local function get_scopes(publicKey, bearer, host)
	if bearer == nil then
		return nil
	end
	local jwt_obj = jwt:load_jwt(bearer)
	local verified = jwt:verify_jwt_obj(publicKey, jwt_obj, {
		iss = validators.equals(host)
	})
	if jwt_obj == nil or verified == false then
		return nil
	end
	if jwt_obj.payload then
		return jwt_obj.payload.scopes
	else
		return nil
	end
end

local function requestHandshake(host)
	local publicKey = ngx.shared.upcachePublicKeys:get(host)
	if publicKey == nil then
		ngx.req.set_header(handshakeHeader, "1")
	end
	return publicKey
end
module.requestHandshake = requestHandshake

local function responseHandshake(host, headers)
	local publicKey = headers[handshakeHeader]
	if publicKey ~= nil then
		console.info("response sets public key on '", host, "'")
		publicKey = ngx.unescape_uri(publicKey)
		headers[handshakeHeader] = nil
		ngx.shared.upcachePublicKeys:set(host, publicKey)
	else
		publicKey = ngx.shared.upcachePublicKeys:get(host)
	end
	return publicKey
end
module.responseHandshake = responseHandshake

function module.get(key, vars)
	local bearer = vars.cookie_bearer
	if bearer == nil then
		return key
	end
	local publicKey = requestHandshake(vars.host)
	if publicKey == nil then
		return key
	end
	return build_key(key, get_restrictions(key), get_scopes(publicKey, bearer, vars.host))
end

function module.set(key, vars, headers)
	local restrictions = headers[scopeHeader];
	if restrictions == nil then return key end
	if type(restrictions) == "string" then
		restrictions = {restrictions}
	end
	update_restrictions(key, restrictions)

	local publicKey = responseHandshake(vars.host, headers)
	if publicKey == nil then
		return key
	end

	return build_key(key, restrictions, get_scopes(publicKey, vars.cookie_bearer, vars.host))
end

return module;

