import {
  compareClipboardFormats,
  sheetsCompact,
  type CellEvidence,
  type ClipboardComparison,
  type CompactStatus,
  type DisplayStatus,
} from "paste-lab";

// A consumer supplies its own quantity policy and decides when to ask for review.
export function inspectQuantity(formats: Readonly<Record<string, string>>, column: number) {
  const result: ClipboardComparison = compareClipboardFormats(formats);
  const compact: CompactStatus = result.formats[sheetsCompact];
  const display: DisplayStatus = result.formats["text/plain"];
  const cell: CellEvidence | undefined = result.cells[0]?.[column];
  if (result.alignment !== "aligned" || compact !== "available" ||
      display !== "available" || !cell || typeof cell.stored !== "number" ||
      !Number.isSafeInteger(cell.stored) || cell.stored < 0 || cell.differences.length) {
    return { status: "review" } as const;
  }
  return { status: "ready", quantity: cell.stored } as const;
}

// @ts-expect-error The workbench's example importer is outside the package API.
type InventoryImporter = typeof import("paste-lab")["importInventoryRow"];
