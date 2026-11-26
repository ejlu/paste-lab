import type { Grid } from "./types.ts";
import { type DefaultTreeAdapterTypes as Tree, parseFragment } from "parse5";

export const maxCells = 20000;
const maxLength = 1_000_000;

export class ParseError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function tooLarge() {
  throw new ParseError(
    "grid-limit",
    "This range exceeds the 20,000-cell preview limit.",
  );
}

// One trailing record separator terminates the last row. Delimiters inside
// quoted fields are data. Preserve CR, LF and CRLF inside those fields.
export function parseText(text: string): Grid {
  const rows = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let endedRow = false;
  let count = 0;
  function endCell() {
    if (++count > maxCells) tooLarge();
    row.push(value);
    value = "";
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    endedRow = false;
    if (quoted && ch === '"') {
      if (text[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        const next = text[i + 1];
        if (next !== undefined && !/[\t\r\n]/.test(next))
          throw new ParseError(
            "invalid-quote",
            "Unexpected text after a closing TSV quote.",
          );
        quoted = false;
      }
    } else if (
      !quoted &&
      ch === '"' &&
      (i === 0 || /[\t\r\n]/.test(text[i - 1])) &&
      value === ""
    ) {
      quoted = true;
    } else if (!quoted && ch === "\t") {
      endCell();
    } else if (!quoted && (ch === "\r" || ch === "\n")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endCell();
      rows.push(row);
      row = [];
      endedRow = true;
    } else {
      value += ch;
    }
  }
  if (quoted)
    throw new ParseError("unclosed-quote", "Unclosed quote in TSV field.");
  if (!endedRow) {
    endCell();
    rows.push(row);
  }
  return { rows, merges: [] };
}

function* walk(
  root: Tree.Node,
  skip?: (node: Tree.Node) => boolean,
): Generator<Tree.Node> {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (skip?.(node)) continue;
    yield node;
    const children = "childNodes" in node ? node.childNodes : [];
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
}

function cellText(cell: Tree.Element) {
  let value = "";
  for (const n of walk(
    cell,
    (n) => "tagName" in n && ["script", "style", "table"].includes(n.tagName),
  )) {
    if ("value" in n && n.nodeName === "#text") value += n.value;
    if (n.nodeName === "br") value += "\n";
  }
  return value;
}

function span(cell: Tree.Element, name: string) {
  const raw = cell.attrs.find((attr) => attr.name === name)?.value;
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const n = Number(raw);
  if (n > maxCells) tooLarge();
  return Math.max(1, n);
}

export function parseHTML(html: string): Grid {
  const fragment = parseFragment(html);
  let table;
  for (const node of walk(fragment)) {
    if ("tagName" in node && node.tagName === "table") {
      table = node;
      break;
    }
  }
  if (!table) {
    // Sheets copies a single cell as one marked span instead of a table.
    const roots = fragment.childNodes.filter(
      (n) =>
        !(
          n.nodeName === "#text" &&
          "value" in n &&
          /^[\t\n\r ]*$/.test(n.value)
        ),
    );
    const root = roots[0];
    if (
      roots.length === 1 &&
      "tagName" in root &&
      root.tagName === "span" &&
      root.attrs.some((a) => a.name === "data-sheets-root" && a.value === "1")
    ) {
      return { rows: [[cellText(root)]], merges: [] };
    }
    throw new ParseError("no-table", "No table found in the HTML payload.");
  }
  const trs = [
    ...walk(table, (n) => n !== table && n.nodeName === "table"),
  ].filter((n): n is Tree.Element => "tagName" in n && n.tagName === "tr");
  if (trs.length > maxCells) tooLarge();
  const rows: Grid["rows"] = trs.map(() => []);
  const merges: Grid["merges"] = [];
  let allocated = 0;
  trs.forEach((tr, r) => {
    let c = 0;
    for (const cell of tr.childNodes.filter(
      (n): n is Tree.Element =>
        "tagName" in n && ["td", "th"].includes(n.tagName),
    )) {
      while (rows[r][c] !== undefined) c++;
      const width = span(cell, "colspan");
      const height = Math.min(span(cell, "rowspan"), trs.length - r);
      if (width * height > maxCells) tooLarge();
      for (let y = r; y < r + height; y++) {
        allocated += Math.max(0, c + width - rows[y].length);
        if (allocated > maxCells) tooLarge();
        for (let x = c; x < c + width; x++) {
          if (rows[y][x] !== undefined)
            throw new ParseError(
              "overlapping-spans",
              "Overlapping HTML table cells.",
            );
          rows[y][x] = null;
        }
      }
      rows[r][c] = cellText(cell);
      if (width > 1 || height > 1)
        merges.push({ row: r, column: c, width, height });
      c += width;
    }
  });
  return {
    rows: rows.map((row) =>
      Array.from(row, (value) => (value === undefined ? "" : value)),
    ),
    merges,
  };
}

export function parseFormat(format: string, raw: string): Grid {
  if (typeof raw !== "string" || raw.length > maxLength)
    throw new ParseError(
      "payload-limit",
      "Preview accepts up to 1 million characters per format.",
    );
  if (format === "text/plain") return parseText(raw);
  if (format === "text/html") return parseHTML(raw);
  throw new ParseError(
    "unsupported-format",
    "Raw view only for this clipboard format.",
  );
}
