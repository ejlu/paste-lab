import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "paste-preview-types-"));
const tsc = join(root, "node_modules/typescript/bin/tsc");
const strict = [
  "--strict",
  "--target",
  "ES2022",
  "--module",
  "NodeNext",
  "--lib",
  "ES2022",
  "--types",
  "node",
];
try {
  // Use separate projects so the consumer can resolve only emitted declarations.
  execFileSync(
    process.execPath,
    [
      tsc,
      "--ignoreConfig",
      ...strict,
      "--declaration",
      "--emitDeclarationOnly",
      "--allowImportingTsExtensions",
      "--rewriteRelativeImportExtensions",
      "--rootDir",
      root,
      "--outDir",
      dir,
      "prototypes/column-preview/index.ts",
      "src/compare.ts",
    ],
    { cwd: root, stdio: "inherit" },
  );
  cpSync(new URL("./consumer.ts", import.meta.url), join(dir, "consumer.ts"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        exactOptionalPropertyTypes: true,
        target: "ES2022",
        module: "NodeNext",
        lib: ["ES2022"],
        types: [],
        noEmit: true,
      },
      files: ["consumer.ts"],
    }),
  );
  execFileSync(process.execPath, [tsc, "-p", dir], { stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
