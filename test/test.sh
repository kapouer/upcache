#!/bin/sh

echo "GET"
curl http://localhost:3030/test
echo "\nGET"
curl http://localhost:3030/test
echo "\nPOST"
curl -XPOST http://localhost:3030/test
echo "\nGET"
curl http://localhost:3030/test
echo "\nGET"
curl http://localhost:3030/test
echo "\nPOST"
curl -XPOST http://localhost:3030/test
echo "\nGET"
curl http://localhost:3030/test
echo "\nGET"
curl http://localhost:3030/test
