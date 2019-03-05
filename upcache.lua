local module = {}
local Lock = require "upcache.lock"
local Tag = require "upcache.tag"
local Map = require "upcache.map"
local common = require "upcache.common"

module._VERSION = "1"

function module.request()
	ngx.req.set_header(common.prefixHeader, module._VERSION)
	local keyReq = upkey()
	local nkeyReq = keyReq
	local method = ngx.req.get_method()
	if method == "GET" or method == "HEAD" then
		nkeyReq = Lock.get(nkeyReq, ngx.var)
	else
		Lock.requestHandshake(ngx.var.host)
	end
	nkeyReq = Map.get(nkeyReq, ngx)
	nkeyReq = Tag.get(nkeyReq)
	ngx.var.fetchKey = ngx.md5(nkeyReq)
	ngx.log(ngx.INFO, "request key '", nkeyReq, "'")
end

function module.response()
	if ngx.var.srcache_fetch_status == "HIT" then
		return
	end
	local method = ngx.req.get_method()
	local keyRes = upkey()
	local nkeyRes = keyRes
	if method == "GET" or method == "HEAD" then
		nkeyRes = Lock.set(nkeyRes, ngx.var, ngx.header)
	else
		Lock.responseHandshake(ngx.var.host, ngx.header)
	end
	nkeyRes = Map.set(nkeyRes, ngx)
	nkeyRes = Tag.set(nkeyRes, ngx.header)
	if nkeyRes == nil then
		ngx.var.storeSkip = 1
	elseif nkeyRes ~= keyRes then
		ngx.var.storeKey = ngx.md5(nkeyRes)
	else
		ngx.var.storeKey = ngx.var.fetchKey
	end
	ngx.log(ngx.INFO, "response key '", nkeyRes, "'")
end

function upkey()
	return (ngx.var.https == "on" and "https" or "http") .. "://" .. ngx.var.host .. ngx.var.request_uri
end

return module
