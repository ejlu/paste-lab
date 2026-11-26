import {
  compareClipboardFormats,
  importInventoryRow,
  sheetsCompact,
  type CellEvidence,
} from "./importer.ts";
import { coordinate } from "./fixture.ts";

export function renderImportPreview(
  section: HTMLElement,
  formats: Readonly<Record<string, string>>,
) {
  section.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = "Inventory import preview";
  section.append(heading);

  const comparison = compareClipboardFormats(formats);
  const { cells, alignment } = comparison;
  const messages = {
    missing: "was not supplied",
    empty: "is empty",
    "no-table": "contains no table",
    malformed: "could not be parsed",
    "limit-exceeded": "exceeds the preview limit",
    "unsupported-layout": "has an unsupported layout",
    unaligned: "could not be aligned to a display grid",
  };
  for (const type of ["text/plain", "text/html", sheetsCompact] as const) {
    const status = comparison.formats[type];
    if (status !== "available")
      section.append(
        paragraph(
          `${type === sheetsCompact ? "Sheets stored-value data" : type} ${messages[status]}.`,
        ),
      );
  }
  if (!cells.length) {
    const reasons = {
      "no-display": "No tabular display data.",
      "shape-mismatch": "The displayed grids have different dimensions.",
      "merged-cells": "The importer requires unmerged cells.",
      aligned: "No cells available.",
    };
    section.append(paragraph(reasons[alignment]));
    return;
  }
  const start = cells.length > 1 ? 1 : 0;
  const rowField = document.createElement("input");
  rowField.type = "number";
  rowField.min = String(start + 1);
  rowField.max = String(cells.length);
  rowField.value = rowField.min;
  const idField = document.createElement("select");
  const qtyField = document.createElement("select");
  const fields = document.createElement("div");
  fields.className = "import-fields";
  fields.append(
    label("Source row", rowField),
    label("Product ID column", idField),
    label("Quantity column", qtyField),
  );
  section.append(
    paragraph(
      start
        ? "Row 1 supplies column names. Map a data row to an inventory record."
        : "Map this row to an inventory record.",
    ),
    fields,
  );
  const evidence = document.createElement("div");
  evidence.className = "import-evidence";
  const result = document.createElement("output");
  result.setAttribute("aria-label", "Import result");
  section.append(evidence, result);
  function refreshColumns() {
    const row = cells[rowField.valueAsNumber - 1];
    const valid = rowField.validity.valid && row?.length;
    idField.disabled = qtyField.disabled = !valid;
    if (valid) {
      const options = row.map((_, c) => {
        const header = start ? (cells[0][c]?.plain ?? cells[0][c]?.html) : "";
        return [coordinate(0, c).slice(0, -1), header]
          .filter(Boolean)
          .join(" · ");
      });
      for (const field of [idField, qtyField]) {
        const previous = field.selectedIndex;
        field.replaceChildren(
          ...options.map((name, c) => new Option(name, String(c))),
        );
        field.selectedIndex = Math.min(
          previous >= 0 ? previous : Number(field === qtyField),
          row.length - 1,
        );
      }
    }
    update();
  }
  function update() {
    evidence.replaceChildren();
    if (idField.disabled) {
      result.dataset.state = "review";
      result.textContent = "Choose a data row in range.";
      return;
    }
    const r = rowField.valueAsNumber - 1;
    const row = cells[r];
    const table = document.createElement("table");
    table.setAttribute("aria-label", "Clipboard evidence for mapped cells");
    const head = table.createTHead().insertRow();
    for (const name of [
      "Cell",
      "Plain text",
      "HTML text",
      "Sheets value",
      "Comparison",
    ]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = name;
      head.append(th);
    }
    const body = table.createTBody();
    for (const c of new Set([idField.selectedIndex, qtyField.selectedIndex])) {
      const cell = row[c];
      const tr = body.insertRow();
      for (const value of [
        coordinate(r, c),
        literal(cell.plain),
        literal(cell.html),
        cell.storedBlank ? "Blank" : literal(cell.stored),
        finding(cell),
      ])
        tr.insertCell().textContent = value;
    }
    evidence.append(table);
    const imported = importInventoryRow(
      comparison,
      r,
      idField.selectedIndex,
      qtyField.selectedIndex,
    );
    result.dataset.state = imported.status;
    result.textContent =
      imported.status === "ready"
        ? JSON.stringify(imported.record, null, 2)
        : "Review required\n" + imported.issues.join("\n");
  }
  rowField.oninput = refreshColumns;
  idField.onchange = qtyField.onchange = update;
  refreshColumns();
}

function literal(v: string | number | null) {
  return v === null ? "Unavailable" : JSON.stringify(v);
}
function finding(cell: CellEvidence) {
  const names = {
    "display-text": "Plain text and HTML differ",
    "stored-blank": "Stored cell is blank but display contains text",
    "stored-text": "Stored text differs from display",
    "stored-number": "Display differs from stored number",
  };
  if (cell.differences.length)
    return cell.differences.map((d) => names[d]).join(" · ");
  if (cell.storedBlank) return "Blank cell";
  return cell.stored === null ? "Display evidence only" : "Values agree";
}
function paragraph(text: string) {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}
function label(text: string, field: HTMLElement) {
  const l = document.createElement("label");
  l.append(text, field);
  return l;
}
