local module = {}
local Lock = require "upcache.lock"
local Tag = require "upcache.tag"
local Vary = require "upcache.vary"
local Map = require "upcache.map"
local common = require "upcache.common"

module._VERSION = "1"

function module.request()
	ngx.req.set_header(common.prefixHeader, module._VERSION)
	local keyReq = upkey()
	local nkeyReq = keyReq
	local method = ngx.req.get_method()
	if method == "GET" or method == "HEAD" then
		nkeyReq = Lock.get(nkeyReq, ngx)
		nkeyReq = Vary.get(nkeyReq, ngx)
		nkeyReq = Map.get(nkeyReq)
	else
		Lock.requestHandshake(ngx.var.host)
	end
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
		nkeyRes = Map.set(nkeyRes, ngx)
		nkeyRes = Lock.set(nkeyRes, ngx)
		nkeyRes = Vary.set(nkeyRes, ngx)
	else
		Lock.responseHandshake(ngx.var.host, ngx.header)
	end
	nkeyRes = Tag.set(nkeyRes, ngx)
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
