import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildDefaultMathProfileDocument } from "../engine/mathProfile";

function main(): void {
  const outputDir = path.resolve(process.cwd(), "artifacts");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, "default.mathProfile.json"),
    JSON.stringify(buildDefaultMathProfileDocument(), null, 2),
  );
  console.log("Wrote artifacts/default.mathProfile.json");
}

main();
