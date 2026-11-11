import * as spice2poly from "./spice2poly.test.ts";
import * as pwl from "./pwl.test.ts";
import * as pswitch from "./pswitch.test.ts";

export const xspiceSuites = [
  { name: "spice2poly", ...spice2poly },
  { name: "pwl", ...pwl },
  { name: "pswitch", ...pswitch },
] as const;
