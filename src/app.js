import { parseFormat } from "./parser.js";
import {
  capturePaste,
  checkExpected,
  coordinate,
  gridFormats,
  visibleWhitespace,
} from "./fixture.js";

const files = import.meta.glob("../fixtures/*.json", {
  eager: true,
  import: "default",
});
const order = [
  "excel-product-codes",
  "sheets-product-codes",
  "sheets-multiline-cell",
  "excel-empty-edges",
  "sheets-merged-header",
  "excel-significant-whitespace",
];
const fixtures = Object.values(files).sort((a, b) => {
  const rank = (id) => (order.includes(id) ? order.indexOf(id) : order.length);
  return rank(a.id) - rank(b.id) || a.id.localeCompare(b.id);
});
const $ = (id) => document.getElementById(id);
const el = (tag, text = "") =>
  Object.assign(document.createElement(tag), { textContent: text });
const caption = (f) =>
  f.source.app.replace(/^Microsoft /, "").replace(/ [0-9].*$/, "");
let active;
let selectedButton;
let acceptedPreview;

for (const f of fixtures) {
  const button = el("button");
  button.append(el("strong", f.title), el("span", caption(f)));
  button.dataset.fixture = f.id;
  button.onclick = () => openFixture(f);
  $("library").append(button);
}

function openFixture(f) {
  active = f;
  $("title").textContent = f.title;
  $("source").textContent = [f.source.app || "Live clipboard", f.source.os]
    .filter(Boolean)
    .join(" / ");
  $("recipe").textContent =
    f.recipe || "Choose a format and select a cell to inspect its value.";
  $("details").textContent = [
    f.source.method,
    f.source.browser,
    f.source.edits,
    "Listed types: " + f.types.join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
  for (const button of $("library").children) {
    button.setAttribute(
      "aria-current",
      String(button.dataset.fixture === f.id),
    );
  }
  $("format").replaceChildren(
    ...Object.keys(f.formats).map((type) => new Option(type, type)),
  );
  $("format").value = Object.hasOwn(f.formats, "text/plain")
    ? "text/plain"
    : Object.keys(f.formats)[0];
  renderFormat();
}

function renderRaw() {
  const value = active.formats[$("format").value];
  const excerpt = value.slice(0, 24000);
  $("raw").textContent =
    ($("spaces").checked ? visibleWhitespace(excerpt) : excerpt) +
    (value.length > excerpt.length
      ? "\n… Preview limited to 24,000 UTF-16 units."
      : "");
  $("length").textContent = value.length.toLocaleString() + " UTF-16 units";
}

function inspect(button, r, c, value) {
  selectedButton?.setAttribute("aria-pressed", "false");
  selectedButton = button;
  button.setAttribute("aria-pressed", "true");
  $("address").textContent = coordinate(r, c);
  $("value").textContent = JSON.stringify(value);
  const codes = Array.from(
    value.slice(0, 256),
    (ch) =>
      "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"),
  );
  $("points").textContent =
    (codes.join("  ") || "Empty string") + (value.length > 256 ? " …" : "");
}

function renderFormat() {
  renderRaw();
  const type = $("format").value;
  const target = $("grid");
  target.replaceChildren();
  selectedButton = undefined;
  $("size").textContent = "";
  $("address").textContent = "Cell";
  $("value").textContent = "Select a cell";
  $("points").textContent = "";
  let grid;
  try {
    grid = parseFormat(type, active.formats[type]);
  } catch (error) {
    target.append(el("p", error.message));
    return;
  }
  const width = grid.rows.reduce((n, r) => Math.max(n, r.length), 0);
  $("size").textContent = grid.rows.length + " rows × " + width + " columns";
  const shownCols = Math.min(width, 50);
  const shownRows = Math.min(grid.rows.length, 100);
  const table = el("table");
  table.setAttribute("aria-label", "Parsed spreadsheet");
  const header = table.createTHead().insertRow();
  header.append(el("th"));
  for (let c = 0; c < shownCols; c++)
    header.append(el("th", coordinate(0, c).slice(0, -1)));
  const body = table.createTBody();
  const merges = new Map(
    grid.merges.map((m) => [coordinate(m.row, m.column), m]),
  );
  let first;
  for (let r = 0; r < shownRows; r++) {
    const row = body.insertRow();
    row.append(el("th", String(r + 1)));
    grid.rows[r].slice(0, shownCols).forEach((value, c) => {
      if (value === null) return;
      const td = row.insertCell();
      const address = coordinate(r, c);
      const merge = merges.get(address);
      if (merge) {
        td.colSpan = Math.min(merge.width, shownCols - c);
        td.rowSpan = Math.min(merge.height, shownRows - r);
      }
      const button = el("button", value);
      button.setAttribute("aria-label", address + " " + (value || "empty"));
      button.setAttribute("aria-pressed", "false");
      button.onclick = () => inspect(button, r, c, value);
      td.append(button);
      first ??= button;
    });
  }
  target.append(table);
  if (width > shownCols || grid.rows.length > shownRows) {
    target.append(
      el(
        "p",
        "Preview shows the first " +
          shownRows +
          " rows and " +
          shownCols +
          " columns.",
      ),
    );
  }
  first?.click();
}

$("paste").onpaste = (event) => {
  event.preventDefault();
  try {
    openFixture(capturePaste(event.clipboardData));
    $("status").textContent = "Range captured.";
  } catch (error) {
    $("status").textContent = error.message;
  }
};
$("format").onchange = renderFormat;
$("spaces").onchange = renderRaw;
$("save").onclick = () => {
  $("name").value = active.id;
  for (const key of ["app", "browser", "os"]) $(key).value = active.source[key];
  $("expected").value = JSON.stringify(active.expected, null, 2);
  acceptedPreview = false;
  $("error").textContent = "";
  $("dialog").showModal();
};
$("expected").oninput = () => {
  acceptedPreview = false;
};
$("usePreview").onclick = () => {
  try {
    const pairs = gridFormats
      .filter((t) => Object.hasOwn(active.formats, t))
      .map((t) => [t, parseFormat(t, active.formats[t])]);
    $("expected").value = JSON.stringify(Object.fromEntries(pairs), null, 2);
    acceptedPreview = true;
    $("error").textContent = "";
  } catch (error) {
    $("error").textContent = error.message;
  }
};
$("cancel").onclick = () => $("dialog").close();
$("form").onsubmit = (event) => {
  event.preventDefault();
  try {
    const id = $("name").value.trim();
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id))
      throw new Error(
        "Use letters, numbers, dashes or underscores in the fixture name.",
      );
    const expected = checkExpected(
      JSON.parse($("expected").value),
      active.formats,
    );
    const source = { ...active.source };
    for (const key of ["app", "browser", "os"])
      source[key] = $(key).value.trim();
    const fixture = {
      ...active,
      id,
      source,
      expected,
      expectationOrigin: acceptedPreview
        ? "accepted-parser-output"
        : "reviewed",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(fixture, null, 2) + "\n"], {
        type: "application/json",
      }),
    );
    const link = Object.assign(el("a"), { href: url, download: id + ".json" });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("dialog").close();
    $("status").textContent = "Saved " + id + ".json";
  } catch (error) {
    $("error").textContent = error.message;
  }
};
openFixture(fixtures.find((f) => f.id === "excel-product-codes"));
