.PHONY: keys
keys:
	mkdir -p fixtures && cd fixtures && rm *.pem; \
	openssl genrsa -out private.pem 2048; \
	openssl rsa -in private.pem -pubout -out public.pem

