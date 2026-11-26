export interface Merge {
  row: number;
  column: number;
  width: number;
  height: number;
}

export interface Grid {
  rows: (string | null)[][];
  merges: Merge[];
}

export type GridFormat = "text/plain" | "text/html";
export type Expected = Partial<Record<GridFormat, Grid | { error: string }>>;
export interface Fixture {
  version: 1;
  id: string;
  title: string;
  recipe: string;
  source: {
    app: string;
    os: string;
    browser: string;
    method: string;
    edits?: string;
  };
  types: string[];
  formats: Record<string, string>;
  expected: Expected;
  expectationOrigin?: "accepted-parser-output" | "reviewed";
}
