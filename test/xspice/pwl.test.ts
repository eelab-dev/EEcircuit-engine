import { verifyFixtures, type XspiceFixture, type XspiceSimulation } from "./helpers.ts";

export const fixtures: XspiceFixture[] = [
  {
    name: "pwl-boundaries",
    netlist: `Native piecewise-linear clamp
V1 in 0 -2
A1 in out transfer
.model transfer pwl(x_array=[-1 0 1] y_array=[-2 0 3] input_domain=1e-12 fraction=TRUE limit=TRUE)
R1 out 0 1k
.dc V1 -2 2 0.5
.save v(out)
.end`,
    expected: { "v(out)": [-2, -2, -2, -1, 0, 1.5, 3, 3, 3] },
  },
  {
    name: "pwl-extrapolation",
    netlist: `Native piecewise-linear extrapolation
V1 in 0 -2
A1 in out transfer
.model transfer pwl(x_array=[-1 0 1] y_array=[-2 0 3] input_domain=1e-12 limit=FALSE)
R1 out 0 1k
.dc V1 -2 2 0.5
.save v(out)
.end`,
    expected: { "v(out)": [-4, -3, -2, -1, 0, 1.5, 3, 4.5, 6] },
  },
  {
    name: "pwl-ac-derivative",
    netlist: `Piecewise-linear AC slope
V1 in 0 DC 0.5 AC 1
A1 in out transfer
.model transfer pwl(x_array=[-1 0 1] y_array=[-2 0 3] input_domain=1e-12)
R1 out 0 1k
.ac lin 2 1 2
.save v(out)
.end`,
    acGain: 3,
  },
  {
    name: "table-conversion",
    netlist: `Ngspice TABLE conversion
V1 in 0 -2
E1 out 0 TABLE {V(in)} = (-1,-2) (0,0) (1,3)
R1 out 0 1k
.dc V1 -2 2 0.5
.save v(out)
.end`,
    expected: { "v(out)": [-2, -2, -1.95, -1, 0.025, 1.5, 2.925, 3, 3] },
  },
];

export function verify(simulation: XspiceSimulation): Promise<string[]> {
  return verifyFixtures(simulation, fixtures);
}
