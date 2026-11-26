export const gridFormats = ["text/plain", "text/html"];

export function coordinate(row, column) {
  let letters = "";
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters + (row + 1);
}

export function visibleWhitespace(text) {
  return text
    .replaceAll(" ", "·")
    .replaceAll("\u00a0", "⍽")
    .replaceAll("\t", "⇥")
    .replaceAll("\r", "␍")
    .replaceAll("\n", "↵\n");
}

export function capturePaste(data) {
  const formats = Object.fromEntries(
    [...data.types]
      .filter((t) => t !== "Files")
      .map((t) => [t, data.getData(t)]),
  );
  if (!Object.keys(formats).length)
    throw new Error(
      "Paste a range with a text representation. File contents are unsupported.",
    );
  return {
    version: 1,
    id: "my-paste",
    title: "My paste",
    recipe: "",
    source: {
      app: "",
      browser: navigator.userAgent,
      os: "",
      method: "Browser paste event",
    },
    types: [...data.types],
    formats,
    expected: {},
  };
}

export function checkExpected(expected, formats) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected))
    throw new Error("Expected a JSON object keyed by clipboard format.");
  for (const format of gridFormats.filter((t) => Object.hasOwn(formats, t))) {
    const grid = expected[format];
    if (
      !grid ||
      !Array.isArray(grid.rows) ||
      !grid.rows.every(
        (row) =>
          Array.isArray(row) &&
          row.every((v) => typeof v === "string" || v === null),
      ) ||
      !Array.isArray(grid.merges) ||
      !grid.merges.every(
        (m) =>
          m &&
          ["row", "column", "height", "width"].every((k) =>
            Number.isSafeInteger(m[k]),
          ) &&
          m.row >= 0 &&
          m.column >= 0 &&
          m.height > 0 &&
          m.width > 0,
      )
    ) {
      throw new Error("Supply rows and merges for " + format + ".");
    }
  }
  for (const k of Object.keys(expected)) {
    if (!gridFormats.includes(k) || !Object.hasOwn(formats, k))
      throw new Error("Unexpected grid format: " + k);
  }
  return expected;
}
