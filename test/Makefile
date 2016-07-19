private/private.pem:
	mkdir -p private; \
	openssl genrsa -out private/private.pem 2048

private/public.pem:
	mkdir -p private; \
	openssl rsa -in private/private.pem -pubout -out private/public.pem

.PHONY: keys
keys: private/private.pem private/public.pem

