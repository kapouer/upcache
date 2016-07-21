private.pem:
	openssl genrsa -out private.pem 1024

public.pem:
	openssl rsa -in private.pem -pubout -out public.pem

.PHONY: keys
keys: private.pem public.pem

