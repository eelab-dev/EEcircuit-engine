export function deepCompare(
  a: unknown,
  b: unknown,
  path: string[] = []
): boolean {
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    if (a !== b) {
      console.error(`Difference at ${path.join(".")}:`, a, b);
      return false;
    }
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (!deepCompare(a[i], b[i], [...path, String(i)])) {
        return false;
      }
    }
  } else {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (
        !deepCompare(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          [...path, key]
        )
      ) {
        return false;
      }
    }
  }

  return true;
}
