FROM ubuntu:latest

# Default version is master
ENV VERSION=master  

RUN apt-get update && apt-get install -y \
  build-essential \
  cmake \
  git \
  wget \
  curl \
  bison \
  python3

RUN apt-get -y install autoconf automake bzip2

#gcc-c++ libstdc++-static.x86_64

RUN apt-get -y install libtool which


## Emscripten
## https://emscripten.org/docs/getting_started/downloads.html


## fix the bug in ngspice
# COPY ./misc_time.c /opt/misc_time.c

COPY ./run.sh /
COPY ./hicum2_patch.sh /

RUN chmod +x /run.sh
RUN chmod +x /hicum2_patch.sh


ENTRYPOINT ["/run.sh"]

## run this command in WSL2:
## docker run -it -e VERSION=next -v $(realpath .):/mnt ngspice:emcc





