import { verifyFixtures, type XspiceFixture, type XspiceSimulation } from "./helpers.ts";

export const fixtures: XspiceFixture[] = [
  {
    name: "poly-five-input",
    netlist: `Five-input polynomial source
V1 x1 0 1
V2 x2 0 2
V3 x3 0 3
V4 x4 0 4
V5 x5 0 5
E1 out 0 POLY(5) x1 0 x2 0 x3 0 x4 0 x5 0 1 2 3 4 5 6
R1 out 0 1k
.dc V1 1 1 1
.save v(out)
.end`,
    expected: { "v(out)": [71] },
  },
  {
    name: "poly-efgh-multivariable",
    netlist: `Polynomial E F G H
V1 x 0 2
V2 y 0 3
VC1 c1 0 0
VC2 c2 0 0
I1 0 c1 2
I2 0 c2 3
E1 e 0 POLY(2) x 0 y 0 1 2 3 4 5 6
G1 0 g POLY(2) x 0 y 0 1 2 3 4 5 6
F1 0 f POLY(2) VC1 VC2 1 2 3 4 5 6
H1 h 0 POLY(2) VC1 VC2 1 2 3 4 5 6
RE e 0 1
RG g 0 1
RF f 0 1
RH h 0 1
.dc V1 2 2 1
.save v(e) v(f) v(g) v(h)
.end`,
    expected: { "v(e)": [114], "v(f)": [114], "v(g)": [114], "v(h)": [114] },
  },
  {
    name: "poly-ac-derivative",
    netlist: `Polynomial AC derivative at DC bias
V1 in 0 DC 2 AC 1
E1 out 0 POLY(1) in 0 1 3 4
R1 out 0 1k
.ac lin 2 1 2
.save v(out)
.end`,
    acGain: 19,
  },
];

export function verify(simulation: XspiceSimulation): Promise<string[]> {
  return verifyFixtures(simulation, fixtures);
}
