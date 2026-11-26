import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const archive = process.argv[2];
if (!archive?.endsWith(".tgz")) throw new Error("Pass the path to the packed .tgz.");
const tarball = realpathSync(resolve(archive));
const source = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(source, "../..");
const { devDependencies } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const cwd = mkdtempSync(join(tmpdir(), "paste-lab-consumer-"));
try {
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ private: true, type: "module" }));
  writeFileSync(join(cwd, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      module: "NodeNext", target: "ES2022", strict: true, skipLibCheck: false,
      types: [], lib: ["ES2022"],
    },
    files: ["consumer.ts"],
  }));
  for (const name of ["consumer.ts", "consumer.test.mjs"]) cpSync(join(source, name), join(cwd, name));
  cpSync(join(root, "fixtures"), join(cwd, "fixtures"), { recursive: true });
  const options = { cwd, stdio: "inherit" };
  console.log("Testing", tarball, "with", process.version, "in", cwd);
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball,
    "typescript@" + devDependencies.typescript], options);
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "."], options);
  execFileSync(process.execPath, ["--test", "consumer.test.mjs"], options);
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
