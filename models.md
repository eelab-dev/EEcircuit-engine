# Transistor Models

The following transistor models are available in EEcircuit for use. Please see the reference link for detail of each models.

### Usage Example:

replace the `MODEL_NAME` from the model names in this document. Replace `WIDTH` and `LENGTH` with appropriate value for each model.

```plaintext
M1 2 1 0 0 MODEL_NAME W=WIDTH L=LENGTH
```

## FreePDK45

add `.include modelcard.FreePDK45` in your netlist.

| Model name  | Node | Type |   Vth |                                        Reference |
| ----------- | :--: | ---: | ----: | -----------------------------------------------: |
| PDK45NTHKOX | 45nm |    N | THKOX | [FreePDK](https://www.eda.ncsu.edu/wiki/FreePDK) |
| PDK45NVTG   | 45nm |    N |   VTG | [FreePDK](https://www.eda.ncsu.edu/wiki/FreePDK) |
| PDK45NVTH   | 45nm |    N |   VTH | [FreePDK](https://www.eda.ncsu.edu/wiki/FreePDK) |
| PDK45NVTL   | 45nm |    N |   VTL | [FreePDK](https://www.eda.ncsu.edu/wiki/FreePDK) |
| PDK45PTHKOX | 45nm |    P | THKOX | [FreePDK](https://www.eda.ncsu.edu/wiki/FreePDK) |
| PDK45PVTG   | 45nm |    P |   VTG | [FreePDK](https://www.eda.ncsu.edu/wiki/FreePDK) |
| PDK45PVTH   | 45nm |    P |   VTH | [FreePDK](https://www.eda.ncsu.edu/wiki/FreePDK) |
| PDK45PVTL   | 45nm |    P |   VTL | [FreePDK](https://www.eda.ncsu.edu/wiki/FreePDK) |

## PTM LP (Low Power)

add `.include modelcard.ptmLP` in your netlist.

| Model name | Node | Type | Nom Vdd |                          Reference |
| ---------- | :--: | ---: | ------: | ---------------------------------: |
| PTMLP16N   | 16nm |    N |    0.9V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMLP16P   | 16nm |    P |    0.9V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMLP22N   | 22nm |    N |   0.95V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMLP22P   | 22nm |    P |   0.95V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMLP32N   | 32nm |    N |    1.0V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMLP32P   | 32nm |    P |    1.0V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMLP45N   | 45nm |    N |    1.1V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMLP45P   | 45nm |    P |    1.1V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |

## PTM HP (High Performance)

add `.include modelcard.ptmHP` in your netlist.

| Model name | Node | Type | Nom vdd |                          Reference |
| ---------- | :--: | ---: | ------: | ---------------------------------: |
| PTMHP16N   | 16nm |    N |    0.7V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMHP16P   | 16nm |    P |    0.7V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMHPP22N  | 22nm |    N |    0.8V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMHP22P   | 22nm |    P |    0.8V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMHP32N   | 32nm |    N |    0.9V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMHP32P   | 32nm |    P |    0.9V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMHP45N   | 45nm |    N |    1.0V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTMHP45P   | 45nm |    P |    1.0V | [ptm.asu.edu](https://mec.umn.edu/ptm/) |

## PTM

add `.include modelcard.ptm` in your netlist.

| Model name | Node  | Type |                          Reference |
| ---------- | :---: | ---: | ---------------------------------: |
| PTM65N     | 65nm  |    N | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTM65P     | 65nm  |    P | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTM90N     | 90nm  |    N | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTM90P     | 90nm  |    P | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTM130N    | 130nm |    N | [ptm.asu.edu](https://mec.umn.edu/ptm/) |
| PTM130P    | 130nm |    P | [ptm.asu.edu](https://mec.umn.edu/ptm/) |

## BSIM4 Benchmark

add `.include modelcard.CMOS90` in your netlist.

Currently `N90` and `P90` models from [BSIM4](https://bsim.berkeley.edu/models/bsim4/) test models are implemented.



## GF180MCU

See [GF180.md](GF180.md) for available models and usage instructions.


## Skywater

Work in progress - see [skywater.md](skywater.md).