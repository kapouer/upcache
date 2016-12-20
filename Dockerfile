# How to
# build  `docker build -t kapouer/upcache .`
# run    `docker run -p 3001:3001 --net="host" -t kapouer/upcache`
# ps     `docker ps`
# stop   `docker stop containerName`
# images `docker images`
# remove `docker rmi -f imageId`
# shell  `docker run --rm -it kapouer/upcache bash -il`

# debian stretch
FROM debian:stretch-slim

LABEL name="upcache" version="0.6.1"

ENV DEBIAN_FRONTEND=noninteractive

RUN mkdir -p /usr/share/man/man1 /usr/share/man/man7 /tmp
RUN apt-get update && apt-get install -y --no-install-recommends wget gnupg ca-certificates apt-transport-https
RUN echo "deb https://people.debian.org/~kapouer/apt/ stretch contrib" >> /etc/apt/sources.list
RUN wget https://people.debian.org/~kapouer/apt/kapouer.gpg.key && apt-key add kapouer.gpg.key
RUN apt-get update && apt-get install -y --no-install-recommends \
  nginx \
  libnginx-mod-http-lua \
  libnginx-mod-http-set-misc \
  libnginx-mod-http-srcache-filter \
  libnginx-mod-http-memc \
  memcached \
  luarocks unzip \
  lua-cjson \
  nodejs nodejs-legacy npm

RUN apt-get clean

RUN luarocks install upcache

# machine-id
RUN echo "12e11ceb84fefe777a02ef52000007db" > /etc/machine-id

# create user
RUN useradd -m user

WORKDIR /home/user

COPY . .

USER user
RUN npm install

USER root
RUN apt-get purge -y luarocks unzip wget gnupg apt-transport-https npm
RUN rm -rf /var/lib/apt/*

# expose app port
EXPOSE 3001

RUN chown -R user:user /home/user/nginx && chown -R user:user /var/lib/nginx

USER user
CMD ./bin/upcache-spawn.js

