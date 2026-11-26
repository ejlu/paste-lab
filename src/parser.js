import { parseFragment } from "parse5";

const maxCells = 20000;
const maxLength = 1_000_000;

function tooLarge() {
  throw new Error("This range exceeds the 20,000-cell preview limit.");
}

// One trailing record separator terminates the last row. Delimiters inside
// quoted fields are data. Preserve CR, LF and CRLF inside those fields.
export function parseText(text) {
  const rows = [];
  let row = [];
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
  if (quoted) throw new Error("Unclosed quote in TSV field.");
  if (!endedRow) {
    endCell();
    rows.push(row);
  }
  return { rows, merges: [] };
}

function* walk(root, skip) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (skip?.(node)) continue;
    yield node;
    const children = node.childNodes ?? [];
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
}

function cellText(cell) {
  let value = "";
  for (const n of walk(cell, (n) =>
    ["script", "style", "table"].includes(n.tagName),
  )) {
    if (n.nodeName === "#text") value += n.value;
    if (n.tagName === "br") value += "\n";
  }
  return value;
}

function span(cell, name) {
  const raw = cell.attrs.find((attr) => attr.name === name)?.value;
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const n = Number(raw);
  if (n > maxCells) tooLarge();
  return Math.max(1, n);
}

export function parseHTML(html) {
  let table;
  for (const node of walk(parseFragment(html))) {
    if (node.tagName === "table") {
      table = node;
      break;
    }
  }
  if (!table) throw new Error("No table found in the HTML payload.");
  const trs = [
    ...walk(table, (n) => n !== table && n.tagName === "table"),
  ].filter((n) => n.tagName === "tr");
  if (trs.length > maxCells) tooLarge();
  const rows = trs.map(() => []);
  const merges = [];
  let allocated = 0;
  trs.forEach((tr, r) => {
    let c = 0;
    for (const cell of tr.childNodes.filter((n) =>
      ["td", "th"].includes(n.tagName),
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
            throw new Error("Overlapping HTML table cells.");
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
    rows: rows.map((row) => Array.from(row, (value) => value ?? null)),
    merges,
  };
}

export function parseFormat(format, raw) {
  if (typeof raw !== "string" || raw.length > maxLength)
    throw new Error("Preview accepts up to 1 million characters per format.");
  if (format === "text/plain") return parseText(raw);
  if (format === "text/html") return parseHTML(raw);
  throw new Error("Raw view only for this clipboard format.");
}
