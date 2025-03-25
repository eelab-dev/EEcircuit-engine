# EEcircuit-engine

Simulation engine for [EEcircuit](https://github.com/eelab-dev/EEcircuit)

## installation

```bash
npm install eecircuit-engine
```

## Usage

import the `Simulation` class and create a new instance of it.

```javascript
import { Simulation } from "eecircuit-engine";

const sim = new Simulation();
```

start the simulation by calling the `start` method. This will initialize the simulation engine, but it does not run any simulation yet.

```javascript
await sim.start();
```

Set your netlist. The netlist is same as ngspice netlist format.

```javascript
const netlist = `
Basic RLC circuit 
.include modelcard.CMOS90

r vdd 2 100.0
l vdd 2 1
c vdd 2 0.01
m1 2 1 0 0 N90 W=100.0u L=0.09u
vdd vdd 0 1.8

vin 1 0 0 pulse (0 1.8 0 0.1 0.1 15 30)
.tran 0.1 5

.end
`;

sim.setNetList(netlist);
```

Run the simulation by calling the `runSim` method. This will run the simulation and return the result.

```javascript
const result = await sim.runSim();
```

You can now access the result of the simulation.

```javascript
console.log(result);
```
