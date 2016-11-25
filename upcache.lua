local module = {}
local cacheScope = require "upcache.scope"
local cacheTag = require "upcache.tag"

local HEADER = "X-Upcache"

module._VERSION = "0.5"

function module.request()
	ngx.req.set_header(HEADER, module._VERSION)
	local keyReq = ngx.var.host .. ngx.var.request_uri
	local nkeyReq = keyReq
	local method = ngx.req.get_method()
	if method == "GET" or method == "HEAD" then
		nkeyReq = cacheScope.get(nkeyReq, ngx.var)
	else
		cacheScope.requestHandshake(ngx.var.host)
	end
	nkeyReq = cacheTag.get(nkeyReq)
	ngx.var.hashReq = ngx.md5(nkeyReq)
	ngx.log(ngx.INFO, "request key '", nkeyReq, "'")
end

function module.response()
	if ngx.var.srcache_fetch_status == "HIT" then
		return
	end
	local method = ngx.req.get_method()
	local keyRes = ngx.var.host .. ngx.var.request_uri
	local nkeyRes = keyRes
	if method == "GET" or method == "HEAD" then
		nkeyRes = cacheScope.set(nkeyRes, ngx.var, ngx.header)
	else
		cacheScope.responseHandshake(ngx.var.host, ngx.header)
	end
	nkeyRes = cacheTag.set(nkeyRes, ngx.header)
	if nkeyRes ~= keyRes then
		ngx.var.hashRes = ngx.md5(nkeyRes)
	else
		ngx.var.hashRes = ngx.var.hashReq
	end
	ngx.log(ngx.INFO, "response key '", nkeyRes, "'")
end

return module
