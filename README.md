# EEcircuit-engine
Simulation engine for EEcircuit


```typescript
import { ResultType, Simulation } from "eecircuit-engine";

export const sim = new Simulation();

sim.setNetList(bsimTrans);

await sim.start();

await sim.runSimP();

const result = await sim.getResult();
```