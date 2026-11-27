import jspreadsheet from "jspreadsheet-ce";
import { stringifyTSV } from "gridclip";
import { previewEvent } from "./adapters.js";

// Jspreadsheet's before-paste hook can veto or replace a TSV block. This
// importer commits the whole rectangle together, retaining it all on review.
export function spreadsheetImporter(element, mapping, guarded, initial) {
  let pending;
  let pasteCommits = 0;
  let beforePasteCalls = 0;
  const sheet = jspreadsheet(element, {
    data: structuredClone(initial),
    columns: initial[0].map(() => ({ type: "text" })),
    parseFormulas: false,
    autoCasting: false,
    onpaste() {
      pasteCommits++;
    },
    onbeforepaste() {
      beforePasteCalls++;
      if (!guarded) return;
      const current = pending;
      pending = undefined;
      if (!current || current.event.eventPhase === Event.NONE) return false;
      const preview = current.preview;
      if (
        preview?.status !== "preview" ||
        preview.rows.some((row) => row.status === "review")
      )
        return false;
      return stringifyTSV(
        preview.rows.map(({ values }) =>
          [values.productId, values.quantity]
            .filter((v) => v !== undefined)
            .map(String),
        ),
      );
    },
  });
  if (guarded)
    document.addEventListener(
      "paste",
      (event) => {
        pending = undefined;
        if (jspreadsheet.current === sheet && sheet.selectedCell)
          pending = { event, preview: previewEvent(event, mapping) };
      },
      true,
    );
  sheet.updateSelectionFromCoords(
    mapping.columns.productId === undefined ? 2 : 1,
    1,
  );
  return () => ({ data: sheet.getData(), beforePasteCalls, pasteCommits });
}
