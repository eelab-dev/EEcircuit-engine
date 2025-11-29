#!/bin/bash

# Check argument for version
if [ "$1" == "next" ]; then
    VERSION="next"
    echo "Selected version: next (building next version)"
elif [ "$1" == "main" ] || [ -z "$1" ]; then
    VERSION=""
    echo "Selected version: main (building main version)"
else
    echo "Error: Invalid version argument '$1'. Supported: 'main' (default), 'next'."
    exit 1
fi

# Ensure build directory exists and is empty
rm -rf ./Docker/build
mkdir -p ./Docker/build

docker build --no-cache -t eecircuit ./Docker
#docker build -t eecircuit ./Docker || exit 1

docker run -t -e VERSION="$VERSION" -v "$(realpath ./Docker)":/mnt eecircuit || exit 1

node ./Docker/inject.mjs || exit 1

echo "build: copying files to src folder"

cp ./Docker/build/spice.wasm ./src/spice.wasm || exit 1
cp ./Docker/build/spice-eesim.js ./src/spice.js || exit 1

echo "build: build script has ended"
