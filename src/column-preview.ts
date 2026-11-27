import type { CellEvidence, ClipboardComparison } from "./compare.ts";

export type ColumnMap =
  | { productId: number; quantity?: number }
  | { productId?: number; quantity: number };
type Field = keyof ColumnMap;
type InventoryValues = { productId: string; quantity: number };
type ColumnValue<Index, Value> = Index extends number ? Value : undefined;
type Projection<C, T extends Record<Field, unknown>> = {
  [K in keyof C as K extends Field ? K : never]: K extends Field
    ? ColumnValue<C[K], T[K]>
    : never;
};
export type PreviewValues<C extends ColumnMap> = Projection<C, InventoryValues>;
type RowResult<V, E> =
  | { sourceRow: number; status: "ready"; values: V; evidence: E }
  | { sourceRow: number; status: "review"; issues: PreviewIssue[] };
export type PreviewRow<C extends ColumnMap = ColumnMap> = RowResult<
  PreviewValues<C>,
  Projection<C, Record<Field, CellEvidence>>
>;

export const issueMessages = {
  "missing-cell": "The mapped source cell is missing.",
  "missing-id": "Product ID needs a displayed value.",
  "id-display-conflict":
    "Product ID needs review because the two displayed strings differ.",
  "id-stored-conflict":
    "Product ID conflicts with the stored value or its required integer spelling.",
  "blank-quantity": "Stored quantity is blank.",
  "unknown-quantity":
    "Quantity needs a stored number. Digit-only text needs review.",
  "invalid-quantity": "Quantity must be a nonnegative safe integer.",
  "quantity-display-conflict":
    "Quantity needs review because the two displayed strings differ.",
  "quantity-spelling":
    "Quantity needs displayed digits that match the stored number.",
} as const;

export interface PreviewIssue {
  field: Field;
  sourceColumn: number;
  code: keyof typeof issueMessages;
  evidence: CellEvidence | null;
}

export type DisplayProblem = {
  format: "text/plain" | "text/html";
  status: "malformed" | "limit-exceeded" | "empty";
};

export function displayProblems(
  comparison: ClipboardComparison,
): DisplayProblem[] {
  const problems: DisplayProblem[] = [];
  for (const format of ["text/plain", "text/html"] as const) {
    const status = comparison.formats[format];
    if (
      status === "malformed" ||
      status === "limit-exceeded" ||
      status === "empty"
    )
      problems.push({ format, status });
  }
  return problems;
}

// Only decimal digits with optional leading zeroes can spell an exact integer.
function displaysInteger(display: string, value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    display.length > 0 &&
    !/[^0-9]/.test(display) &&
    display.replace(/^0+(?=[0-9])/, "") === String(value)
  );
}

function productId(
  cell: CellEvidence,
): string | { code: keyof typeof issueMessages } {
  const display = cell.plain ?? cell.html;
  if (cell.differences.includes("display-text"))
    return { code: "id-display-conflict" };
  if (!display?.trim()) return { code: "missing-id" };
  if (
    cell.storedBlank ||
    cell.differences.includes("stored-text") ||
    (typeof cell.stored === "number" && !displaysInteger(display, cell.stored))
  )
    return { code: "id-stored-conflict" };
  return display;
}

function quantity(
  cell: CellEvidence,
): number | { code: keyof typeof issueMessages } {
  if (cell.storedBlank) return { code: "blank-quantity" };
  if (typeof cell.stored !== "number") return { code: "unknown-quantity" };
  if (!Number.isSafeInteger(cell.stored) || cell.stored < 0)
    return { code: "invalid-quantity" };
  if (cell.differences.includes("display-text"))
    return { code: "quantity-display-conflict" };
  if (!displaysInteger(cell.plain ?? cell.html ?? "", cell.stored))
    return { code: "quantity-spelling" };
  return cell.stored;
}

/** @internal Single-row policy for the existing workbench. The batch entry checks alignment and formats. */
export function previewRow<C extends ColumnMap>(
  cells: CellEvidence[],
  sourceRow: number,
  columns: C,
): PreviewRow<C>;
export function previewRow(
  cells: CellEvidence[],
  sourceRow: number,
  columns: ColumnMap,
): RowResult<Partial<InventoryValues>, Partial<Record<Field, CellEvidence>>> {
  const values: Partial<InventoryValues> = {};
  const mappedEvidence: Partial<Record<Field, CellEvidence>> = {};
  const issues: PreviewIssue[] = [];
  for (const field of ["productId", "quantity"] as const) {
    const sourceColumn = columns[field];
    if (sourceColumn === undefined) continue;
    const evidence = cells[sourceColumn] ?? null;
    if (!evidence) {
      issues.push({ field, sourceColumn, code: "missing-cell", evidence });
      continue;
    }
    mappedEvidence[field] = evidence;
    const result =
      field === "productId" ? productId(evidence) : quantity(evidence);
    if (typeof result === "object")
      issues.push({ field, sourceColumn, code: result.code, evidence });
    else if (typeof result === "string") values.productId = result;
    else values.quantity = result;
  }
  return issues.length
    ? { status: "review", sourceRow, issues }
    : { status: "ready", sourceRow, values, evidence: mappedEvidence };
}

export type PastePreview<C extends ColumnMap = ColumnMap> = {
  formats: ClipboardComparison["formats"];
} & (
  | {
      status: "blocked";
      reason:
        | Exclude<ClipboardComparison["alignment"], "aligned">
        | "no-data-rows"
        | "column-out-of-range";
    }
  | { status: "blocked"; reason: "invalid-display"; problems: DisplayProblem[] }
  | { status: "preview"; rows: PreviewRow<C>[] }
);

/** Coordinates are zero-based offsets in the original paste. A header is skipped only by request. */
export function previewInventoryPaste<C extends ColumnMap>(
  comparison: ClipboardComparison,
  { columns, headerRows }: { columns: C; headerRows: 0 | 1 },
): PastePreview<C> {
  if (columns.productId === undefined && columns.quantity === undefined)
    throw new RangeError("Map at least one source column.");
  for (const column of [columns.productId, columns.quantity]) {
    if (column !== undefined && (!Number.isSafeInteger(column) || column < 0))
      throw new RangeError(
        "Source column indices must be nonnegative safe integers.",
      );
  }
  if (headerRows !== 0 && headerRows !== 1)
    throw new RangeError("headerRows must be 0 or 1.");
  const problems = displayProblems(comparison);
  if (problems.length)
    return {
      status: "blocked",
      reason: "invalid-display",
      problems,
      formats: comparison.formats,
    };
  if (comparison.alignment !== "aligned")
    return {
      status: "blocked",
      reason: comparison.alignment,
      formats: comparison.formats,
    };
  if (comparison.cells.length <= headerRows)
    return {
      status: "blocked",
      reason: "no-data-rows",
      formats: comparison.formats,
    };
  const dataRows = comparison.cells.slice(headerRows);
  if (
    [columns.productId, columns.quantity].some(
      (index) =>
        index !== undefined && dataRows.every((row) => index >= row.length),
    )
  )
    return {
      status: "blocked",
      reason: "column-out-of-range",
      formats: comparison.formats,
    };
  return {
    status: "preview",
    formats: comparison.formats,
    rows: dataRows.map((cells, i) =>
      previewRow(cells, i + headerRows, columns),
    ),
  };
}
