local module = {}
local Lock = require "upcache.lock"
local Tag = require "upcache.tag"
local Vary = require "upcache.vary"
local Map = require "upcache.map"
local common = require "upcache.common"
local console = common.console

module._VERSION = "1"

module.jwt = Lock.jwt

function module.request()
	ngx.req.set_header(common.prefixHeader, module._VERSION)
	local vars = ngx.var
	local method = ngx.req.get_method()
	if method == "GET" or method == "HEAD" then
		local key = upkey(vars)
		key = Lock.get(key, vars, ngx)
		key = Vary.get(key, vars, ngx)
		key = Map.get(key)
		key = Tag.get(key)
		vars.fetchKey = ngx.md5(key)
		console.info("request key '", key, "'")
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
		if nkey == nil then
			vars.storeSkip = 1
		elseif nkey ~= key then
			vars.storeKey = ngx.md5(nkey)
		else
			vars.storeKey = vars.fetchKey
		end
		console.info("response key '", nkey, "'")
	else
		Lock.response(vars, ngx)
		Tag.response(vars, ngx)
	end
end

function upkey(vars)
	return (vars.https == "on" and "https" or "http") .. "://" .. vars.host .. vars.request_uri
end

return module
