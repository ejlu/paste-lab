import type { Expected, Fixture, GridFormat } from "./types.ts";

export const gridFormats: GridFormat[] = ["text/plain", "text/html"];

export function coordinate(row: number, column: number) {
  let letters = "";
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters + (row + 1);
}

export function visibleWhitespace(text: string) {
  return text
    .replaceAll(" ", "·")
    .replaceAll("\u00a0", "⍽")
    .replaceAll("\t", "⇥")
    .replaceAll("\r", "␍")
    .replaceAll("\n", "↵\n");
}

export function capturePaste(
  data: Pick<DataTransfer, "types" | "getData">,
): Fixture {
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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function checkExpected(
  expected: unknown,
  formats: Record<string, string>,
): Expected {
  if (!record(expected))
    throw new Error("Expected a JSON object keyed by clipboard format.");
  for (const key of Object.keys(expected)) {
    if (!gridFormats.some((t) => t === key) || !Object.hasOwn(formats, key))
      throw new Error("Unexpected grid format: " + key);
  }
  for (const format of gridFormats.filter((t) => Object.hasOwn(formats, t))) {
    const grid = expected[format];
    if (
      record(grid) &&
      typeof grid.error === "string" &&
      grid.error.length &&
      Object.keys(grid).length === 1
    )
      continue;
    if (
      !record(grid) ||
      "error" in grid ||
      !Array.isArray(grid.rows) ||
      !grid.rows.every(
        (row) =>
          Array.isArray(row) &&
          row.every((v) => typeof v === "string" || v === null),
      ) ||
      !Array.isArray(grid.merges) ||
      !grid.merges.every(
        (m: unknown) =>
          record(m) &&
          ["row", "column", "height", "width"].every(
            (k) =>
              typeof m[k] === "number" &&
              Number.isSafeInteger(m[k]) &&
              m[k] >= (k === "row" || k === "column" ? 0 : 1),
          ),
      )
    ) {
      throw new Error(
        "Supply rows and merges or an expected error for " + format + ".",
      );
    }
  }
  return expected;
}

// Validate versioned JSON at build/test boundaries before the UI uses it.
export function assertFixture(value: unknown): asserts value is Fixture {
  if (
    !record(value) ||
    value.version !== 1 ||
    !["id", "title", "recipe"].every((k) => typeof value[k] === "string") ||
    !record(value.source) ||
    !record(value.formats) ||
    !Object.keys(value.formats).length ||
    !Array.isArray(value.types) ||
    !value.types.every((t) => typeof t === "string")
  ) {
    throw new Error("Invalid version 1 fixture metadata.");
  }
  const source = value.source;
  if (
    !["app", "os", "browser", "method"].every(
      (k) => typeof source[k] === "string",
    ) ||
    (source.edits !== undefined && typeof source.edits !== "string")
  )
    throw new Error("Invalid fixture source.");
  const formats: Record<string, string> = Object.create(null);
  for (const [type, raw] of Object.entries(value.formats)) {
    if (typeof raw !== "string" || !value.types.includes(type))
      throw new Error("Invalid captured format: " + type);
    formats[type] = raw;
  }
  checkExpected(value.expected, formats);
}
