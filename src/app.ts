import type { Fixture, Expected, Grid } from "./types.ts";
import { ParseError, parseFormat } from "./parser.ts";
import {
  assertFixture,
  capturePaste,
  checkExpected,
  coordinate,
  gridFormats,
  visibleWhitespace,
} from "./fixture.ts";

const files = import.meta.glob<unknown>("../fixtures/*.json", {
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
const fixtures = Object.values(files)
  .map((value) => {
    assertFixture(value);
    return value;
  })
  .sort((a, b) => {
    const rank = (id: string) =>
      order.includes(id) ? order.indexOf(id) : order.length;
    return rank(a.id) - rank(b.id) || a.id.localeCompare(b.id);
  });
function element<K extends keyof HTMLElementTagNameMap>(tag: K, id: string) {
  const node = document.querySelector<HTMLElementTagNameMap[K]>(tag + "#" + id);
  if (!node) throw new Error("Missing " + id);
  return node;
}

const ui = {
  match: element("span", "match"),
  inspector: element("div", "inspector"),
  displayTitle: element("input", "display-title"),
  recipeInput: element("textarea", "recipe-input"),
  recent: element("button", "recent"),
  library: element("nav", "library"),
  title: element("h1", "title"),
  source: element("p", "source"),
  recipe: element("p", "recipe"),
  details: element("p", "details"),
  format: element("select", "format"),
  raw: element("pre", "raw"),
  spaces: element("input", "spaces"),
  length: element("span", "length"),
  address: element("b", "address"),
  value: element("code", "value"),
  points: element("p", "points"),
  grid: element("div", "grid"),
  size: element("span", "size"),
  paste: element("textarea", "paste"),
  status: element("p", "status"),
  save: element("button", "save"),
  name: element("input", "name"),
  expected: element("textarea", "expected"),
  error: element("p", "error"),
  dialog: element("dialog", "dialog"),
  usePreview: element("button", "usePreview"),
  cancel: element("button", "cancel"),
  form: element("form", "form"),
  app: element("input", "app"),
  os: element("input", "os"),
  browser: element("input", "browser"),
};
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "") =>
  Object.assign(document.createElement(tag), { textContent: text });
const caption = (f: Fixture) =>
  f.source.app.replace(/^Microsoft /, "").replace(/ [0-9].*$/, "");
let active: Fixture;
let selectedButton: HTMLButtonElement | undefined;
let acceptedPreview = false;

let recent: Fixture | undefined;
function choose(f: Fixture) {
  openFixture(f);
  if (matchMedia("(max-width: 760px)").matches)
    ui.title.scrollIntoView({ block: "start" });
}
ui.recent.onclick = () => {
  if (recent) choose(recent);
};
for (const f of fixtures) {
  const button = el("button");
  button.append(el("strong", f.title), el("span", caption(f)));
  button.dataset.fixture = f.id;
  button.onclick = () => choose(f);
  ui.library.append(button);
}

function openFixture(f: Fixture) {
  active = f;
  ui.title.textContent = f.title;
  ui.source.textContent = [f.source.app || "Live clipboard", f.source.os]
    .filter(Boolean)
    .join(" / ");
  ui.recipe.textContent =
    f.recipe || "Choose a format and select a cell to inspect its value.";
  ui.details.textContent = [
    f.source.method,
    f.source.browser,
    f.source.edits,
    "Listed types: " + f.types.join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
  for (const button of ui.library.children) {
    button.setAttribute(
      "aria-current",
      String(f !== recent && button.getAttribute("data-fixture") === f.id),
    );
  }
  ui.recent.setAttribute("aria-pressed", String(f === recent));
  ui.format.replaceChildren(
    ...Object.keys(f.formats).map((type) => new Option(type, type)),
  );
  ui.format.value = Object.hasOwn(f.formats, "text/plain")
    ? "text/plain"
    : Object.keys(f.formats)[0];
  renderFormat();
}

function renderRaw() {
  const value = active.formats[ui.format.value];
  const excerpt = value.slice(0, 24000);
  ui.raw.textContent =
    (ui.spaces.checked ? visibleWhitespace(excerpt) : excerpt) +
    (value.length > excerpt.length
      ? "\n… Preview limited to 24,000 UTF-16 units."
      : "");
  ui.length.textContent = value.length.toLocaleString() + " UTF-16 units";
}

function inspect(
  button: HTMLButtonElement,
  r: number,
  c: number,
  value: string,
) {
  if (selectedButton) {
    selectedButton.tabIndex = -1;
    selectedButton.setAttribute("aria-pressed", "false");
  }
  button.tabIndex = 0;
  selectedButton = button;
  button.setAttribute("aria-pressed", "true");
  ui.address.textContent = coordinate(r, c);
  ui.value.textContent = JSON.stringify(value);
  const codes: string[] = [];
  let units = 0;
  for (const ch of value) {
    if (codes.length === 256) break;
    codes.push(
      "U+" + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0"),
    );
    units += ch.length;
  }
  ui.points.textContent =
    (codes.join("  ") || "Empty string") + (value.length > units ? " …" : "");
}

function mergeKey(m: Grid["merges"][number]) {
  return [m.row, m.column, m.width, m.height].join(",");
}
function matches(actual: Grid, expected: Grid) {
  return (
    actual.rows.length === expected.rows.length &&
    actual.rows.every(
      (row, i) =>
        row.length === expected.rows[i].length &&
        row.every((v, j) => v === expected.rows[i][j]),
    ) &&
    actual.merges.length === expected.merges.length &&
    actual.merges.map(mergeKey).sort().join(";") ===
      expected.merges.map(mergeKey).sort().join(";")
  );
}
function verdict(equal: boolean) {
  ui.match.textContent = equal
    ? "Matches expectation"
    : "Differs from expectation";
  ui.match.dataset.result = equal ? "match" : "difference";
}
function renderFormat() {
  renderRaw();
  const type = ui.format.value;
  const target = ui.grid;
  target.replaceChildren();
  selectedButton = undefined;
  ui.size.textContent = "";
  ui.address.textContent = "Cell";
  ui.value.textContent = "Select a cell";
  ui.points.textContent = "";
  ui.inspector.hidden = true;
  ui.match.textContent = "";
  delete ui.match.dataset.result;
  const format = gridFormats.find((k) => k === type);
  if (!format) {
    target.append(
      el("p", "This format is available in the clipboard source view."),
    );
    return;
  }
  const expected = active.expected[format];
  let grid;
  try {
    grid = parseFormat(type, active.formats[type]);
  } catch (error) {
    const problem = el(
      "p",
      error instanceof Error ? error.message : String(error),
    );
    problem.setAttribute("role", "alert");
    target.append(problem);
    if (expected)
      verdict(
        "error" in expected &&
          error instanceof ParseError &&
          error.code === expected.error,
      );
    return;
  }
  if (expected) verdict("rows" in expected && matches(grid, expected));
  const width = grid.rows.reduce((n, r) => Math.max(n, r.length), 0);
  ui.size.textContent = grid.rows.length + " rows × " + width + " columns";
  const shownCols = Math.min(width, 50);
  const shownRows = Math.min(grid.rows.length, 100);
  const table = el("table");
  table.setAttribute("aria-label", "Parsed spreadsheet");
  const header = table.createTHead().insertRow();
  header.append(el("th"));
  for (let c = 0; c < shownCols; c++)
    header.append(
      Object.assign(el("th", coordinate(0, c).slice(0, -1)), { scope: "col" }),
    );
  const body = table.createTBody();
  const merges = new Map(
    grid.merges.map((m) => [coordinate(m.row, m.column), m]),
  );
  const cells: HTMLButtonElement[][] = Array.from(
    { length: shownRows },
    () => [],
  );
  let first: HTMLButtonElement | undefined;
  for (let r = 0; r < shownRows; r++) {
    const row = body.insertRow();
    row.append(Object.assign(el("th", String(r + 1)), { scope: "row" }));
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
      if (expected && "rows" in expected && expected.rows[r]?.[c] !== value) {
        td.classList.add("different");
        button.title =
          "Expected " + JSON.stringify(expected.rows[r]?.[c] ?? null);
      }
      button.setAttribute(
        "aria-label",
        address +
          " " +
          (value.trim() ? value : visibleWhitespace(value) || "empty"),
      );
      button.setAttribute("aria-pressed", "false");
      button.tabIndex = -1;
      for (let y = r; y < r + td.rowSpan; y++) {
        for (let x = c; x < c + td.colSpan; x++) cells[y][x] = button;
      }
      button.onkeydown = (event) => {
        const offsets: Record<string, [number, number]> = {
          ArrowLeft: [0, -1],
          ArrowRight: [0, td.colSpan],
          ArrowUp: [-1, 0],
          ArrowDown: [td.rowSpan, 0],
        };
        const move = offsets[event.key];
        if (!move) return;
        event.preventDefault();
        const next = cells[r + move[0]]?.[c + move[1]];
        next?.focus();
        next?.click();
      };
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
  ui.inspector.hidden = !first;
  first?.click();
}

ui.paste.onpaste = (event) => {
  event.preventDefault();
  try {
    if (!event.clipboardData) throw new Error("Clipboard data is unavailable.");
    recent = capturePaste(event.clipboardData);
    ui.recent.hidden = false;
    choose(recent);
    ui.status.textContent = "Range captured.";
  } catch (error) {
    ui.status.textContent =
      error instanceof Error ? error.message : String(error);
  }
};
ui.format.onchange = renderFormat;
ui.spaces.onchange = renderRaw;
ui.save.onclick = () => {
  ui.name.value = active.id;
  ui.displayTitle.value = active === recent ? "" : active.title;
  ui.recipeInput.value = active.recipe;
  for (const key of ["app", "browser", "os"] as const)
    ui[key].value = active.source[key];
  ui.expected.value = JSON.stringify(active.expected, null, 2);
  acceptedPreview = active.expectationOrigin === "accepted-parser-output";
  ui.error.textContent = "";
  ui.dialog.showModal();
};
ui.expected.oninput = () => {
  acceptedPreview = false;
};
ui.usePreview.onclick = () => {
  try {
    const expected: Expected = {};
    for (const format of gridFormats) {
      if (!Object.hasOwn(active.formats, format)) continue;
      try {
        expected[format] = parseFormat(format, active.formats[format]);
      } catch (err) {
        if (!(err instanceof ParseError)) throw err;
        expected[format] = { error: err.code };
      }
    }
    ui.expected.value = JSON.stringify(expected, null, 2);
    acceptedPreview = true;
    ui.error.textContent = "";
  } catch (error) {
    ui.error.textContent =
      error instanceof Error ? error.message : String(error);
  }
};
ui.cancel.onclick = () => ui.dialog.close();
ui.form.onsubmit = (event) => {
  event.preventDefault();
  try {
    const id = ui.name.value.trim();
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id))
      throw new Error(
        "Use letters, numbers, dashes or underscores in the fixture name.",
      );
    const expected = checkExpected(
      JSON.parse(ui.expected.value),
      active.formats,
    );
    const source = { ...active.source };
    for (const key of ["app", "browser", "os"] as const)
      source[key] = ui[key].value.trim();
    const fixture: Fixture = {
      ...active,
      id,
      title: ui.displayTitle.value.trim() || id,
      recipe: ui.recipeInput.value.trim(),
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
    ui.dialog.close();
    ui.status.textContent = "Saved " + id + ".json";
  } catch (error) {
    ui.error.textContent =
      error instanceof Error ? error.message : String(error);
  }
};
openFixture(fixtures[0]);
