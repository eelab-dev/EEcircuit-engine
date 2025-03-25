import { skywaterParams } from "./params.ts";
import { nfet18 } from "./nfet18.ts";
import { pfet18 } from "./pfet18.ts";
import { pfet18_hvt } from "./pfet18_hvt.ts";

export const skywaterModel =
  skywaterParams + "\n\n" + nfet18 + "\n\n" + pfet18 + "\n\n" + pfet18_hvt;
