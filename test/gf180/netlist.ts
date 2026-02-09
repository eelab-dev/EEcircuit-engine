export const gf180Netlist = `
* GF180 Single DC Simulation
.include modelcard.GF180
.lib sm141064.ngspice typical

.param Wum=10.0 Lum=10.0
.param Rext=0.01
.param Ldiff_um=0.24
.param AD_um2={Wum*Ldiff_um}
.param PD_um={2*(Wum+Ldiff_um)}

* Circuit
Rd_ext d_supply d {Rext}
Rs_ext s_virt 0 {Rext}
X1 d g s_virt 0 nmos_3p3 w={Wum*1u} l={Lum*1u} ad={AD_um2}p as={AD_um2}p pd={PD_um}u ps={PD_um}u m=1.0

Vd d_supply 0 0
Vg g 0 3.3

.dc Vd 0 3.3 0.01

.control
run
write out.raw
.endc
.end
`;
