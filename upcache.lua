local module = {}
local cacheScope = require "upcache.scope"
local cacheTag = require "upcache.tag"

cacheScope.publicKeys = ngx.shared.upcachePublicKeys
cacheScope.restrictions = ngx.shared.upcacheRestrictions

cacheTag.tags = ngx.shared.upcacheTags
cacheTag.variants = ngx.shared.upcacheVariants

function module.request()
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
