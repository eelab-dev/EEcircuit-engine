#!/bin/bash
echo "build: Entryponit script is Running..."

echo "build: Installing emscripten..."

NGSPICE_HOME="https://github.com/danchitnis/ngspice-sf-mirror"
#NGSPICE_HOME="https://git.code.sf.net/p/ngspice/ngspice"

echo "build: ngsice git repository is $NGSPICE_HOME"

cd /opt
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

echo "build: emscripten is installed"

############################################

echo -e "\n"
echo "build: cloning ngspice repository..."

cd /opt
git clone $NGSPICE_HOME ngspice-ngspice
cd ngspice-ngspice

############################################

echo -e "\n"
echo "build: determining the latest release version and branch..."

# Step 1: Find the latest tag with the version format "ngspice-X.Y"
latest_tag=$(git tag | grep -E '^ngspice-[0-9]+\.[0-9]+$' | sort -V | tail -n 1)
if [ -z "$latest_tag" ]; then
  echo "build: No ngspice tags found."
  exit 1
fi
latest_version=${latest_tag#ngspice-}  # Extract version number (e.g., 44.2)
echo "build: Latest tag: $latest_tag (version $latest_version)"

# Step 2: Find the branch with a higher version than the latest tag.
# We assume branch names are in the form "pre-master-X" or "pre-master-X.Y"
# Extract the version number, sort them, and then pick the first branch with a version > latest_version.
branch_version=$(git branch -r | \
  grep -Eo 'pre-master-[0-9]+(\.[0-9]+)?' | \
  sed -E 's/.*pre-master-([0-9]+(\.[0-9]+)?)/\1/' | \
  sort -V | \
  awk -v latest="$latest_version" '{ if ($1+0 > latest+0) { print $1; exit } }')

if [ -n "$branch_version" ]; then
  echo "build: Branch with higher version: pre-master-$branch_version"
else
  echo "build: No branch found with a version higher than $latest_version"
  exit 1
fi

############################################

echo -e "\n"
echo "build: Running build requested is: $VERSION"

#### mods!!!!

if [ "$VERSION" == "next" ]; then
  echo "build: Checking out the branch pre-master-$branch_version"
  git checkout hv_cppduals_new
  cp /hicum2_patch.sh ./hicum2_patch.sh
  ./hicum2_patch.sh || { echo "build: hicum2 patch failed, stopping execution"; exit 1; }

else
  echo "build: Checking out the master branch for version $latest_version"
fi

############################################

echo -e "\n"
echo "build: Applying patches..."
echo "build: Branch name is $(git branch --show-current)"


#https://www.cyberciti.biz/faq/how-to-use-sed-to-find-and-replace-text-in-files-in-linux-unix-shell/
#https://sourceforge.net/p/ngspice/patches/99/
sed -i 's/-Wno-unused-but-set-variable/-Wno-unused-const-variable/g' ./configure.ac
sed -i 's/AC_CHECK_FUNCS(\[time getrusage\])/AC_CHECK_FUNCS(\[time\])/g' ./configure.ac
sed -i 's|#include "ngspice/ngspice.h"|#include <emscripten.h>\n\n#include "ngspice/ngspice.h"|g' ./src/frontend/control.c
sed -i 's|freewl = wlist = getcommand(string);|emscripten_sleep(100);\n\n\t\tfreewl = wlist = getcommand(string);|g' ./src/frontend/control.c


############################################

echo -e "\n"
echo "build: Building ngspice..."

./autogen.sh
mkdir release
cd release

emconfigure ../configure --disable-debug --disable-openmp --disable-xspice -with-readline=no
wait

# ngspice$(EXEEXT)
sed -i 's|$(ngspice_LDADD) $(LIBS)|$(ngspice_LDADD) $(LIBS) -g1 -s ASYNCIFY=1 -s ASYNCIFY_ADVISE=0 -s ASYNCIFY_IGNORE_INDIRECT=0 -s ENVIRONMENT="web,worker" -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORTED_RUNTIME_METHODS=["FS","Asyncify"] -o spice.mjs|g' ./src/Makefile



emmake make -j || { echo "build: Make failed, stopping execution"; exit 1; }
#emmake make 2>&1 | tee make.log

wait

############################################

echo -e "\n"
echo "build: Copying the build artifacts..."

cd src
mv spice.mjs spice.js
mkdir -p /mnt/build
\cp spice.js spice.wasm /mnt/build

echo "build: Build artifacts are copied to /mnt/build"

############################################

echo -e "\n"
echo -e "build: Docker script is ended\n"





