#!/bin/bash
# https://sourceforge.net/p/ngspice/bugs/793/
echo "Removing hicum2 and c++ from ngspice"

# Remove lines with 'AC_CHECK_LIB(stdc++, main, ...)' and 'AC_SUBST(XTRALIBS, ...)' from configure.ac
sed -i '/AC_CHECK_LIB(stdc++/d' configure.ac
sed -i '/AC_SUBST(XTRALIBS/d' configure.ac

# Remove line with 'src/spicelib/devices/hicum2/Makefile' from configure.ac (appears twice)
sed -i '/src\/spicelib\/devices\/hicum2\/Makefile/d' configure.ac
sed -i '/tests\/hicum2\/Makefile/d' configure.ac

# Remove hicum2 from DYNAMIC_DEVICELIBS in src/Makefile.am
sed -i '/spicelib\/devices\/hicum2\/libhicum2.la/d' src/Makefile.am

# Remove hicum2 from SUBDIRS in src/spicelib/devices/Makefile.am
sed -i '/^[[:space:]]*hicum2[[:space:]]*\\\?/d' src/spicelib/devices/Makefile.am

# Remove get_hicum_info line from src/spicelib/devices/dev.c
sed -i '/get_hicum_info/d' src/spicelib/devices/dev.c

# Remove hicum2 from tests/Makefile.am
sed -i '/^[[:space:]]*hicum2[[:space:]]*\\\?[[:space:]]*$/d' ./tests/Makefile.am

echo "Removing hicum2 and c++ from ngspice completed"