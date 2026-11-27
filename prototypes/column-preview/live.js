import { tabulatorImporter, previewEvent } from "./adapters.js";
import { spreadsheetImporter } from "./jspreadsheet.js";
import "tabulator-tables/dist/css/tabulator.min.css";
import "jspreadsheet-ce/dist/jspreadsheet.css";
const native =
  new URLSearchParams(location.search).get("grid") === "jspreadsheet";
const name = native ? "Jspreadsheet CE" : "Tabulator";
document.querySelector("#title").textContent = name + " live inventory trial";
const grid = document.querySelector("#grid"),
  log = document.querySelector("#log");
const mapping = { columns: { quantity: 0 }, headerRows: 0 };
const read = native
  ? spreadsheetImporter(grid, mapping, true, [
      ["", "", ""],
      ["", "", "pending"],
    ])
  : await tabulatorImporter(grid, mapping, true);
document.querySelector("#instructions").textContent = native
  ? "Copy a quantity from Sheets, click cell C2, then press Command-V or Ctrl-V."
  : "Copy a quantity from Sheets, focus the grid, then press Command-V or Ctrl-V.";
const focusButton = document.querySelector("#focus");
focusButton.hidden = native;
focusButton.onclick = () => grid.focus();
let counter = 0;
window.addEventListener(
  "paste",
  (e) => {
    const result = previewEvent(e, mapping);
    const row = result.rows?.[0];
    const cell = row?.evidence?.quantity ?? row?.issues?.[0]?.evidence;
    const note = {
      grid: name,
      paste: ++counter,
      trusted: e.isTrusted,
      plain: cell?.plain,
      html: cell?.html,
      stored: cell?.stored,
      decision: row?.status ?? result.reason,
    };
    setTimeout(() => {
      const state = read();
      Object.assign(
        note,
        native
          ? {
              beforePaste: state.beforePasteCalls,
              writes: state.pasteCommits,
              quantity: state.data[1][2],
            }
          : {
              writes: state.records.length,
              quantity: state.records.at(-1)?.quantity ?? null,
            },
      );
      log.textContent += JSON.stringify(note) + "\n";
    }, 0);
  },
  true,
);
log.textContent = "Ready for keyboard paste.\n";
