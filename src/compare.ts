import { parseFormat, ParseError } from "./parser.ts";
import type { Grid } from "./types.ts";

export const sheetsCompact =
  "application/x-vnd.google-spreadsheet-compact-table+json";

export interface CellEvidence {
  plain: string | null;
  html: string | null;
  stored: string | number | null;
  /** Set only when the decoded Sheets layout explicitly marks this cell blank. */
  storedBlank?: true;
  differences: (
    | "display-text"
    | "stored-text"
    | "stored-number"
    | "stored-blank"
  )[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The observed row-major layout uses 195 for a value and 194 for a blank.
// A negative integer repeats the following marker that many times.
function populatedPositions(layout: unknown, count: number): number[] | null {
  if (!Array.isArray(layout)) return null;
  const positions: number[] = [];
  let position = 0;
  for (let i = 0; i < layout.length; i++) {
    let marker: unknown = layout[i];
    let length = 1;
    if (typeof marker === "number" && marker < 0) {
      length = -marker;
      marker = layout[++i];
    }
    if (
      !Number.isSafeInteger(length) ||
      length > count - position ||
      (marker !== 194 && marker !== 195)
    )
      return null;
    const end = position + length;
    if (marker === 195) {
      for (let cell = position; cell < end; cell++) positions.push(cell);
    }
    position = end;
  }
  return position === count ? positions : null;
}

type StoredGrid = (number | string | null)[];

function storedValues(
  slots: Record<string, unknown>,
  layout: unknown,
  count: number,
): StoredGrid | null {
  const positions = populatedPositions(layout, count);
  const kinds = slots["1"],
    numbers = slots["3"] ?? [],
    strings = slots["4"] ?? [];
  if (
    !Array.isArray(kinds) ||
    !positions ||
    kinds.length !== positions.length ||
    !Array.isArray(numbers) ||
    !Array.isArray(strings)
  )
    return null;
  const values: StoredGrid = Array(count).fill(null);
  let numberIndex = 0,
    stringIndex = 0;
  for (const [i, kind] of kinds.entries()) {
    if (kind === 1) {
      const value: unknown = numbers[numberIndex++];
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      values[positions[i]] = value;
    } else if (kind === 2 || kind === 4) {
      const value: unknown = strings[stringIndex++];
      if (typeof value !== "string") return null;
      values[positions[i]] = value;
    } else return null;
  }
  return numberIndex === numbers.length && stringIndex === strings.length
    ? values
    : null;
}

type DisplayFormat = "text/plain" | "text/html";
export type DisplayStatus =
  | "available"
  | "missing"
  | "empty"
  | "no-table"
  | "malformed"
  | "limit-exceeded";
export type CompactStatus =
  | "available"
  | "missing"
  | "empty"
  | "malformed"
  | "limit-exceeded"
  | "unsupported-layout"
  | "unaligned";

export interface ClipboardComparison {
  cells: CellEvidence[][];
  formats: Record<DisplayFormat, DisplayStatus> &
    Record<typeof sheetsCompact, CompactStatus>;
  alignment: "aligned" | "no-display" | "merged-cells" | "shape-mismatch";
}

function readDisplay(
  type: DisplayFormat,
  raw: string | undefined,
): { status: DisplayStatus; grid?: Grid } {
  if (raw === undefined) return { status: "missing" };
  if (raw === "") return { status: "empty" };
  try {
    const grid = parseFormat(type, raw);
    return grid.rows.some((row) => row.length > 0)
      ? { status: "available", grid }
      : { status: "empty" };
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    if (error.code === "no-table") return { status: "no-table" };
    if (error.code === "grid-limit" || error.code === "payload-limit")
      return { status: "limit-exceeded" };
    return { status: "malformed" };
  }
}

function readCompact(
  raw: string | undefined,
  rows: Grid["rows"] | undefined,
): { status: CompactStatus; values?: StoredGrid } {
  if (raw === undefined) return { status: "missing" };
  if (raw === "") return { status: "empty" };
  if (raw.length > 1_000_000) return { status: "limit-exceeded" };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { status: "malformed" };
  }
  if (!rows || !rows.every((row) => row.length === rows[0].length))
    return { status: "unaligned" };
  if (
    !record(data) ||
    data["1"] !== 1 ||
    !record(data["15"]) ||
    !record(data["3"])
  )
    return { status: "unsupported-layout" };
  const height = data["15"]["1"],
    width = data["15"]["2"];
  if (
    typeof height !== "number" ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    typeof width !== "number" ||
    !Number.isSafeInteger(width) ||
    width <= 0
  )
    return { status: "unsupported-layout" };
  if (height !== rows.length || width !== rows[0].length)
    return { status: "unaligned" };
  const values = storedValues(data["3"], data["2"], height * width);
  return values
    ? { status: "available", values }
    : { status: "unsupported-layout" };
}

export function compareClipboardFormats(
  formats: Readonly<Record<string, string>>,
): ClipboardComparison {
  const plain = readDisplay("text/plain", formats["text/plain"]);
  const html = readDisplay("text/html", formats["text/html"]);
  const plainGrid = plain.grid,
    htmlGrid = html.grid;
  const rows = (plainGrid ?? htmlGrid)?.rows;
  let alignment: ClipboardComparison["alignment"] = "aligned";
  if (!rows) alignment = "no-display";
  else if (htmlGrid?.merges.length) alignment = "merged-cells";
  else if (
    plainGrid &&
    htmlGrid &&
    (plainGrid.rows.length !== htmlGrid.rows.length ||
      plainGrid.rows.some((row, r) => row.length !== htmlGrid.rows[r].length))
  )
    alignment = "shape-mismatch";
  const compact = readCompact(
    formats[sheetsCompact],
    alignment === "aligned" ? rows : undefined,
  );
  const statuses = {
    "text/plain": plain.status,
    "text/html": html.status,
    [sheetsCompact]: compact.status,
  };
  if (!rows || alignment !== "aligned")
    return { cells: [], formats: statuses, alignment };
  const width = rows[0].length;
  const cells = rows.map((row, r) =>
    row.map((_, c): CellEvidence => {
      const text = plainGrid?.rows[r][c] ?? null,
        markup = htmlGrid?.rows[r][c] ?? null;
      const stored = compact.values?.[r * width + c];
      const differences: CellEvidence["differences"] = [];
      if (text !== null && markup !== null && text !== markup)
        differences.push("display-text");
      const displays = [text, markup].filter((v) => v !== null);
      if (
        typeof stored === "number" &&
        displays.some((v) => v !== String(stored))
      )
        differences.push("stored-number");
      if (typeof stored === "string" && displays.some((v) => v !== stored))
        differences.push("stored-text");
      if (stored === null) {
        if (displays.some((v) => v !== "")) differences.push("stored-blank");
        return {
          plain: text,
          html: markup,
          stored,
          storedBlank: true,
          differences,
        };
      }
      return { plain: text, html: markup, stored: stored ?? null, differences };
    }),
  );
  return { cells, formats: statuses, alignment };
}
