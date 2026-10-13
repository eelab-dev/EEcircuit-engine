#!/bin/bash
# Statically link XSPICE (incl. the spice2poly code model needed for POLY) into ngspice.
#
# Run from the ngspice source root, BEFORE ./autogen.sh.
#
# Why this is needed: stock ngspice loads code models (.cm files) with dlopen(),
# which doesn't work in a single-file WASM build. Instead we
#   1. build cmpp (the code model preprocessor) natively on the build machine,
#   2. use it to generate C sources for spice2poly,
#   3. compile those into libcmxsp (already linked into the ngspice binary),
#   4. register the model in spice_init_devices() so no `codemodel` command is needed.
set -e

SRC_ROOT=$(pwd)
CMPP_SRC=$SRC_ROOT/src/xspice/cmpp
ICM=$SRC_ROOT/src/xspice/icm
CM_DIR=$SRC_ROOT/src/xspice/cm
HOST_DIR=$(mktemp -d)
GEN=$(mktemp -d)
trap 'rm -rf "$HOST_DIR" "$GEN"' EXIT

fail() { echo "xspice: ERROR: $*" >&2; exit 1; }

[ -d "$CMPP_SRC" ] && [ -d "$ICM/spice2poly" ] && [ -d "$CM_DIR" ] \
    || fail "run this from the ngspice source root (XSPICE sources not found in $SRC_ROOT)"

# --- 1. native cmpp (must use the host compiler, NOT emcc) -------------------
echo "xspice: building host cmpp..."
bison -d -o "$HOST_DIR/ifs_yacc.c" "$CMPP_SRC/ifs_yacc.y"
bison -d -o "$HOST_DIR/mod_yacc.c" "$CMPP_SRC/mod_yacc.y"
flex -o "$HOST_DIR/ifs_lex.c" "$CMPP_SRC/ifs_lex.l"
flex -o "$HOST_DIR/mod_lex.c" "$CMPP_SRC/mod_lex.l"
gcc -O1 -w -I"$HOST_DIR" -I"$CMPP_SRC" -o "$HOST_DIR/cmpp" \
    "$CMPP_SRC"/{main,file_buffer,pp_ifs,pp_lst,pp_mod,read_ifs,writ_ifs,util}.c \
    "$HOST_DIR"/{ifs_lex,ifs_yacc,mod_lex,mod_yacc}.c
CMPP=$HOST_DIR/cmpp

# --- 2. generate spice2poly sources -----------------------------------------
echo "xspice: generating spice2poly sources..."
CM=spice2poly
MODEL=$(head -n 1 "$ICM/$CM/modpath.lst" | tr -d '[:space:]')      # icm_spice2poly
[ -n "$MODEL" ] || fail "no model listed in $ICM/$CM/modpath.lst"
[ -z "$(tr -d '[:space:]' < "$ICM/$CM/udnpath.lst")" ] || fail "$CM unexpectedly has UDNs"
mkdir -p "$GEN/$MODEL"
CMPP_IDIR=$ICM/$CM            CMPP_ODIR=$GEN        "$CMPP" -lst
CMPP_IDIR=$ICM/$CM/$MODEL     CMPP_ODIR=$GEN/$MODEL "$CMPP" -ifs
CMPP_IDIR=$ICM/$CM/$MODEL     CMPP_ODIR=$GEN/$MODEL "$CMPP" -mod

cp "$GEN/$MODEL/cfunc.c"   "$CM_DIR/static_${CM}_cfunc.c"
cp "$GEN/$MODEL/ifspec.c"  "$CM_DIR/static_${CM}_ifspec.c"
cp "$GEN/cmextrn.h"        "$CM_DIR/static_cmextrn.h"
cp "$GEN/cminfo.h"         "$CM_DIR/static_cminfo.h"
# The model's own headers (cfunc.mod may #include local files)
for f in "$ICM/$CM/$MODEL"/*.h; do
    if [ -e "$f" ]; then cp "$f" "$CM_DIR/"; fi
done

# --- 3. registration glue ----------------------------------------------------
cat > "$CM_DIR/static_cm.c" <<'EOF'
/* Statically linked XSPICE code models (replaces dlopen of .cm files) */
#include "ngspice/config.h"
#include "ngspice/devdefs.h"
#include "static_cmextrn.h"

static SPICEdev *static_cm_table[] = {
#include "static_cminfo.h"
    NULL
};

SPICEdev **static_cm_devices(int *n)
{
    *n = (int) (sizeof static_cm_table / sizeof static_cm_table[0]) - 1;
    return static_cm_table;
}
EOF

# --- 4. build system patches -------------------------------------------------
# Compile the generated files into libcmxsp. Appending (+=) instead of editing
# the existing lists, so this doesn't depend on how upstream formats them.
grep -qE '^libcmxsp_la_SOURCES *=' "$CM_DIR/Makefile.am" \
    || fail "libcmxsp_la_SOURCES not found in $CM_DIR/Makefile.am"
cat >> "$CM_DIR/Makefile.am" <<'EOF'

# --- static code models (added by xspice_static.sh) ---
libcmxsp_la_SOURCES += static_cm.c static_spice2poly_cfunc.c static_spice2poly_ifspec.c
AM_CPPFLAGS += -I$(srcdir)
EOF

# Don't build cmpp/icm (.cm shared libs)/verilog/vhdl for the target.
# Remove those words from whatever SUBDIRS list this ngspice version has (the
# list differs between versions); everything else is left alone.
XS_MK=src/xspice/Makefile.am
grep -qE '^SUBDIRS[[:space:]]*=' "$XS_MK" || fail "no SUBDIRS line in $XS_MK"
sed -i -E '/^SUBDIRS[[:space:]]*=/ {
    s/[[:space:]]+(cmpp|icm|verilog|vhdl)([[:space:]]|$)/ \2/g
    s/[[:space:]]+(cmpp|icm|verilog|vhdl)([[:space:]]|$)/ \2/g
}' "$XS_MK"
SUBDIRS_LINE=$(grep -E '^SUBDIRS[[:space:]]*=' "$XS_MK")
if echo "$SUBDIRS_LINE" | grep -qE '(^|[[:space:]=])(cmpp|icm|verilog|vhdl)([[:space:]]|$)'; then
    fail "could not remove cmpp/icm/verilog/vhdl from SUBDIRS in $XS_MK; line is: $SUBDIRS_LINE"
fi
echo "$SUBDIRS_LINE" | grep -qE '(^|[[:space:]=])cm([[:space:]]|$)' \
    || fail "SUBDIRS in $XS_MK no longer contains 'cm'; line is: $SUBDIRS_LINE"
echo "xspice: $SUBDIRS_LINE"

# Register the models when the device table is built.
python3 - <<'EOF'
import re, sys
p = 'src/spicelib/devices/dev.c'
s = open(p).read()
pat = re.compile(r'^([ \t]*)DEVices\[i\][ \t]*=[ \t]*static_devices\[i\]\(\);[ \t]*\n', re.M)
m = pat.search(s)
if not m:
    sys.exit("xspice: ERROR: anchor 'DEVices[i] = static_devices[i]();' not found in " + p)
add = m.group(0) + r'''
#ifdef XSPICE
    {
        /* statically linked code models (spice2poly, needed for POLY) */
        extern SPICEdev **static_cm_devices(int *n);
        extern int MIFiSize, MIFmSize;
        int n, k;
        SPICEdev **cmdevs = static_cm_devices(&n);

        DEVices = TREALLOC(SPICEdev *, DEVices, DEVNUM + n);
        DEVicesfl = TREALLOC(int, DEVicesfl, DEVNUM + n);
        for (k = 0; k < n; k++) {
            DEVices[DEVNUM + k] = cmdevs[k];
            DEVices[DEVNUM + k]->DEVinstSize = &MIFiSize;
            DEVices[DEVNUM + k]->DEVmodSize = &MIFmSize;
            DEVicesfl[DEVNUM + k] = 1;
        }
        DEVNUM += n;
    }
#endif
'''
s = s[:m.start()] + add + s[m.end():]
open(p, 'w').write(s)
EOF
grep -q static_cm_devices src/spicelib/devices/dev.c || fail "dev.c patch failed"

echo "xspice: static XSPICE patch applied"
