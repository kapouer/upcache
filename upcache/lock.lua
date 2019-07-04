local jwt = require 'resty.jwt'
local validators = require "resty.jwt-validators"

local common = require 'upcache.common'
local console = common.console

local module = {}

local headerLock = common.prefixHeader .. "-Lock"
local headerKey = common.prefixHeader .. "-Lock-Key"
local headerVar = common.prefixHeader .. "-Lock-Var"
local upcacheLocks = 'upcacheLocks'

-- star is voluntarily removed from that pattern
local quotepattern = '(['..("%^$().[]+-?"):gsub("(.)", "%%%1")..'])'

local function quoteReg(str)
	return str:gsub(quotepattern, "%%%1")
end

local function logKey(from, what, key, data)
	if string.find(key, quoteReg(what) .. "$") == nil then return end
	console.info(from, " ", key, console.encode(data))
end

local function authorize(locks, token)
	-- array of used grants
	local grants = {}
	if locks == nil then
		return grants
	end
	if token == nil then
		return grants
	end
	local grant, found

	for i, lock in ipairs(locks) do
		found = false
		if lock:find("%*") and token.grants ~= nil then
			regstr = "^" .. quoteReg(lock):gsub('*', '.*') .. "$"
			for i, grant in ipairs(token.grants) do
				if grant:find(regstr) ~= nil then
					table.insert(grants, grant)
					break
				end
			end
		elseif lock:find(":") then
			grant = string.gsub(lock, "%w*:(%w+)", function(key)
				local val = token[key]
				if val ~= nil then
					found = true
					return token[key]
				end
			end)
			if found == true then
				table.insert(grants, grant)
			end
		elseif token.grants ~= nil then
			for i, grant in ipairs(token.grants) do
				if grant == lock then
					table.insert(grants, grant)
					break
				end
			end
		end
	end
	if #grants > 0 then
		table.sort(grants)
	end
	return grants
end

local function build_key(key, locks, token)
	local grants = authorize(locks, token)
	local str = table.concat(grants, ',')
	if str:len() > 0 then key = str .. ' ' .. key end
	return key
end

local function get_locks(key)
	return common.get(common.variants, key, 'locks')
end

local function update_locks(key, data)
	common.set(common.variants, key, data, 'locks')
end

local function get_jwt(conf, vars)
	if conf.key == nil then
		return nil
	end
	local varname = conf.varname
	if varname == nil then
		varname = "cookie_bearer"
	end
	local bearer = vars[varname]
	if bearer == nil then
		return nil
	end
	local jwt_obj = jwt:load_jwt(bearer)
	local verified = jwt:verify_jwt_obj(conf.key, jwt_obj, {
		iss = validators.equals(vars.host)
	})
	if jwt_obj == nil or verified == false then
		return nil
	end
	return jwt_obj.payload
end

local function request(vars)
	local conf = common.get(upcacheLocks, vars.host)
	if conf.key == nil then
		ngx.req.set_header(headerKey, "1")
	end
	return conf
end
module.request = request

local function response(vars, ngx)
	local host = vars.host
	local headers = ngx.header
	local varname = headers[headerVar]
	local key = headers[headerKey]
	local conf = common.get(upcacheLocks, host)
	local update = false

	if varname ~= nil then
		console.info("response sets var on '", host, "': ", varname)
		conf.varname = varname
		headers[headerVar] = nil
		update = true
	end
	if key ~= nil then
		console.info("response sets key on '", host, "' with ", key:len(), " bytes")
		key = ngx.unescape_uri(key)
		conf.key = key
		headers[headerKey] = nil
		update = true
	end
	if update then
		common.set(upcacheLocks, host, conf)
	end
	return conf
end
module.response = response

function module.jwt(vars, ngx)
	return console.encode(get_jwt(request(vars), vars))
end

function module.get(key, vars, ngx)
	local conf = request(vars)
	return build_key(key, get_locks(key), get_jwt(conf, vars))
end

function module.set(key, vars, ngx)
	local headers = ngx.header
	local conf = response(vars, ngx)
	local locks = common.parseHeader(headers[headerLock])
	if locks == nil then
		return key
	end
	update_locks(key, locks)
	return build_key(key, locks, get_jwt(conf, vars))
end

return module;

