local module = {}
local Lock = require "upcache.lock"
local Tag = require "upcache.tag"
local Vary = require "upcache.vary"
local Map = require "upcache.map"
local common = require "upcache.common"
local console = common.console

module._VERSION = "1"

module.jwt = Lock.jwt

local function upkey(vars)
	return (vars.https == "on" and "https" or "http") .. "://" .. vars.host .. vars.request_uri
end

function module.request()
	if module.disabled then
		return
	end
	ngx.req.set_header(common.prefixHeader, module._VERSION)
	local vars = ngx.var
	local method = ngx.req.get_method()
	if method == "GET" or method == "HEAD" then
		local key = upkey(vars)
		local nkey = Lock.get(key, vars, ngx)
		nkey = Vary.get(nkey, vars, ngx)
		nkey = Map.get(nkey)
		nkey = Tag.get(nkey)
		if nkey ~= key then
			console.info("Req key changed: ", key, " >> ", nkey)
		else
			console.info("Req key: ", nkey)
		end
		vars.fetchKey = ngx.md5(nkey)
	else
		Lock.request(vars)
	end
end

function module.response()
	local vars = ngx.var
	if vars.srcache_fetch_status == "HIT" then
		return
	end
	local method = ngx.req.get_method()
	local key = upkey(vars)
	local nkey = key
	if method == "GET" or method == "HEAD" then
		nkey = Lock.set(nkey, vars, ngx)
		nkey = Vary.set(nkey, vars, ngx)
		nkey = Map.set(nkey, vars, ngx)
		nkey = Tag.set(nkey, vars, ngx)
		if vars.storeSkip == '1' then
			-- do nothing
		elseif nkey ~= key then
			console.info("New key: ", key, " >> ", nkey)
			vars.storeKey = ngx.md5(nkey)
		else
			console.info("Same key: ", key)
			vars.storeKey = vars.fetchKey
		end
	else
		Lock.response(vars, ngx)
		Tag.response(vars, ngx)
	end
end



return module
