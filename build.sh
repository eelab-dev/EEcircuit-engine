#!/bin/bash

docker build --no-cache -t eecircuit ./Docker

docker run -t -e VERSION=next -v $(realpath ./Docker):/mnt eecircuit

node ./Docker/inject.mjs 

echo "build: copying files to src folder"

cp ./Docker/build/spice.wasm ./src/spice.wasm
cp ./Docker/build/spice-eesim.js ./src/spice.js

echo "build: build script has ended"