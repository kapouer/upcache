
luarocks:
	luarocks --tree=rocks install lua-resty-jwt 0.1.11
	luarocks --tree=rocks install lua-resty-string 0.09
	luarocks --tree=rocks install lua-messagepack 0.3.4
	curl -L https://github.com/openresty/lua-resty-lock/archive/v0.07.tar.gz | \
		tar -C ./rocks/share/lua/5.1/ -x -v -z -f - \
			--wildcards '*/lib/resty/*' --strip-components 2
	curl -L https://github.com/openresty/lua-resty-core/archive/v0.1.12.tar.gz | \
		tar -C ./rocks/share/lua/5.1/ -x -v -z -f - \
			--wildcards '*/lib/resty/*' --wildcards '*/lib/ngx/*' --strip-components 2
	curl -L https://github.com/openresty/lua-resty-lrucache/archive/v0.07.tar.gz | \
		tar -C ./rocks/share/lua/5.1/ -x -v -z -f - \
			--wildcards '*/lib/resty/*' --strip-components 2


nginx/mime.types:
	cd nginx && ln -sf /etc/nginx/mime.types .

