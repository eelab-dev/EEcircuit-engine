#!/bin/bash

# Check if the first argument is 'next'
if [ "$1" == "next" ]; then
    VERSION="next"
    echo "Selected version: next (building next version)"
else
    VERSION=""
    echo "Selected version: current (building current version)"
fi

docker build --no-cache -t eecircuit ./Docker
#docker build -t eecircuit ./Docker || exit 1

docker run -t -e VERSION="$VERSION" -v "$(realpath ./Docker)":/mnt eecircuit || exit 1

node ./Docker/inject.mjs || exit 1

echo "build: copying files to src folder"

cp ./Docker/build/spice.wasm ./src/spice.wasm || exit 1
cp ./Docker/build/spice-eesim.js ./src/spice.js || exit 1

echo "build: build script has ended"
