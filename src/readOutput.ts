/**
 * Read output from spice
 */

export type VariableType = {
  name: string;
  type: "voltage" | "current" | "time" | "frequency" | "notype";
};

export type RealDataType = {
  name: string;
  type: VariableType["type"];
  values: RealNumber[];
};

export type ComplexDataType = {
  name: string;
  type: VariableType["type"];
  values: ComplexNumber[];
};

export type ResultType =
  | {
    header: string;
    numVariables: number;
    variableNames: string[];
    numPoints: number;
    dataType: "real";
    data: RealDataType[];
  }
  | {
    header: string;
    numVariables: number;
    variableNames: string[];
    numPoints: number;
    dataType: "complex";
    data: ComplexDataType[];
  };

type RawResultType = {
  param: ParamType;
  header: string;
  data: RealNumber[][] | ComplexNumber[][];
};

type ParamType = {
  varNum: number;
  pointNum: number;
  variables: VariableType[];
  dataType: "real" | "complex";
};

export type RealNumber = number;
export type ComplexNumber = { real: number; img: number };

export function readRawOutput(rawData: Uint8Array): RawResultType {
  // Make a non-resizable copy of rawData to avoid "The provided ArrayBuffer value must not be resizable"
  // error in newer browsers when WebAssembly.Memory is resizable.
  const copiedData = new Uint8Array(rawData);

  const resultStr = ab2str(copiedData);

  const offset = resultStr.indexOf("Binary:");
  if (offset < 0) throw new Error("Missing binary ngspice output header");
  log(`file-> ${offset}`);
  const header = resultStr.substring(0, offset) + "\n";

  //let out: number[];
  const out: number[] = [] as number[];
  const param = findParams(header);
  if (!Number.isInteger(param.varNum) || param.varNum <= 0 ||
      !Number.isInteger(param.pointNum) || param.pointNum <= 0) {
    throw new Error("Empty or invalid ngspice output dimensions");
  }
  const expectedBytes = param.varNum * param.pointNum * 8 * (param.dataType === "complex" ? 2 : 1);
  if (copiedData.byteLength - offset - 8 !== expectedBytes) {
    throw new Error("Truncated or inconsistent ngspice output");
  }
  log(header);
  log(param);

  const view = new DataView(copiedData.buffer, offset + 8);

  for (let i = 0; i < view.byteLength; i = i + 8) {
    const d = view.getFloat64(i, true);
    if (!Number.isFinite(d)) throw new Error("Nonfinite ngspice output");
    out.push(d);
    //log(`float -> ${d}`);
  }

  log("🤔", out);

  if (param.dataType === "complex") {
    const out2 = Array.from({ length: param.varNum }, () => new Array<ComplexNumber>(param.pointNum));
    //https://gregstoll.com/~gregstoll/floattohex/
    //
    for (let i = 0; i < out.length; i = i + 2) {
      const complex = { real: out[i], img: out[i + 1] };
      const index = i / 2;
      out2[index % param.varNum][Math.floor(index / param.varNum)] = {
        ...complex,
      };
    }
    log(out2);

    const rawResult: RawResultType = {
      param: param,
      header: header,
      data: out2,
    };
    return rawResult;
  } else {
    // Real
    const out2 = Array.from({ length: param.varNum }, () => new Array<RealNumber>(param.pointNum).fill(0));
    //https://gregstoll.com/~gregstoll/floattohex/
    //
    out.forEach((e, i) => {
      out2[i % param.varNum][Math.floor(i / param.varNum)] = e;
    });
    //log(out2);

    const rawResult: RawResultType = {
      param: param,
      header: header,
      data: out2,
    };
    return rawResult;
  }
}

function ab2str(buf: Uint8Array) {
  return new TextDecoder("utf-8").decode(buf);
}

function findParams(header: string): ParamType {
  //

  const lines = header.split("\n");

  log("header in findParam->", lines);

  const varNum = parseInt(
    lines[lines.findIndex((s) => s.startsWith("No. Variables"))].split(":")[1],
    10
  );
  const pointNum = parseInt(
    lines[lines.findIndex((s) => s.startsWith("No. Points"))].split(":")[1],
    10
  );
  const dataType =
    lines[lines.findIndex((s) => s.startsWith("Flags"))]
      .split(":")[1]
      .indexOf("complex") > -1
      ? "complex"
      : "real";

  //log("🤔", lines);
  //log(lines.indexOf("Variables:"));

  const varList: VariableType[] = [] as VariableType[];
  for (let i = 0; i < varNum; i++) {
    const str = lines[i + lines.indexOf("Variables:") + 1];
    const str2 = str.split(/\s+/).filter((s) => s.length > 0); // Filter out empty strings
    log("str2->", str2);
    varList.push({
      name: str2[1], // Variable name is the 2nd non-empty column
      type: str2[2] as VariableType["type"], // Variable type is the 3rd non-empty column
    });
  }
  //log("varlist->", varList);

  const param: ParamType = {
    varNum: varNum,
    pointNum: pointNum,
    variables: [...varList],
    dataType: dataType,
  };

  log("param->", param);

  return param;
}

export function readOutput(output: Uint8Array): ResultType {
  const rawResult = readRawOutput(output);
  const param = rawResult.param;
  const header = rawResult.header;
  const data = rawResult.data;

  if (param.dataType === "complex") {
    // Filter to only include voltage, current, and time and frequency variables
    const filteredData = (data as ComplexNumber[][])
      .map((values, i) => ({
        name: param.variables[i].name,
        type: param.variables[i].type,
        values: values,
        index: i,
      }))
      .filter((item) => item.type !== "notype");

    if (!filteredData.length) throw new Error("No supported ngspice output variables");

    return {
      header: header,
      numVariables: filteredData.length,
      variableNames: filteredData.map((e) => e.name),
      numPoints: param.pointNum,
      dataType: "complex",
      data: filteredData.map((e) => ({
        name: e.name,
        type: e.type,
        values: e.values,
      })),
    };
  } else {
    // Filter to only include voltage, current, and time and frequency variables
    const filteredData = (data as number[][])
      .map((values, i) => ({
        name: param.variables[i].name,
        type: param.variables[i].type,
        values: values,
        index: i,
      }))
      .filter((item) => item.type !== "notype");

    if (!filteredData.length) throw new Error("No supported ngspice output variables");

    return {
      header: header,
      numVariables: filteredData.length,
      variableNames: filteredData.map((e) => e.name),
      numPoints: param.pointNum,
      dataType: "real",
      data: filteredData.map((e) => ({
        name: e.name,
        type: e.type,
        values: e.values,
      })),
    };
  }
}

function log(message?: unknown, ...optionalParams: unknown[]) {
  const isDebug = false;
  if (isDebug) console.log(message, optionalParams);
}
