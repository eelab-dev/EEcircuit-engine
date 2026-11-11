import { verifyFixtures, type XspiceFixture, type XspiceSimulation } from "./helpers.ts";

export const fixtures: XspiceFixture[] = [
  {
    name: "pswitch-transition",
    netlist: `Native switch linear resistance
V1 control 0 0
VS supply 0 1
A1 %gd(control 0) %gd(supply out) sw
.model sw pswitch(cntl_off=0 cntl_on=1 r_off=1000 r_on=100 log=FALSE)
R1 out 0 1000
.dc V1 -0.5 1.5 0.5
.save v(out)
.end`,
    expected: { "v(out)": [0.5, 0.5, 1000 / 1550, 1000 / 1100, 1000 / 1100] },
  },
  {
    name: "vswitch-conversion",
    compatibility: true,
    netlist: `Ngspice built-in PSpice switch conversion
.options reltol=1e-9 abstol=1e-14 vntol=1e-12
V1 control 0 -1
VS supply 0 1
S1 supply out control 0 sw
.model sw VSWITCH(VON=1 VOFF=0 RON=100 ROFF=1000)
R1 out 0 1000
.dc V1 -1 2 0.5
.save v(out)
.end`,
    expected: { "v(out)": [0.5, 0.5, 0.5, 1000 / (1000 + Math.sqrt(100 * 1000)), 1000 / 1100, 1000 / 1100, 1000 / 1100] },
  },
];

export function verify(simulation: XspiceSimulation): Promise<string[]> {
  return verifyFixtures(simulation, fixtures);
}
