import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildMathProfileDocument } from "../engine/mathProfile";
import { loadProfileDocument } from "./verifyProfile";

function main(): void {
  const profilePath = process.argv[2];
  if (!profilePath) {
    throw new Error("usage: npm run sim:promote-profile -- <verified-profile.json> [outputPath] [profileVersion]");
  }

  const outputPath = path.resolve(process.cwd(), process.argv[3] ?? "artifacts/approved.mathProfile.json");
  const profileVersion = process.argv[4];
  const profile = loadProfileDocument(profilePath);
  const verification = profile.metadata.verification;

  if (!verification) {
    throw new Error("profile has no verification metadata; run sim:verify-batch first");
  }
  if (!verification.passed) {
    throw new Error(`profile verification did not pass: ${verification.failures.join("; ")}`);
  }

  const timestamp = new Date().toISOString();
  const approved = buildMathProfileDocument(profile.config, {
    ...profile.metadata,
    profileVersion: profileVersion ?? profile.metadata.profileVersion,
    status: "approved",
    updatedAt: timestamp,
    verification,
    notes: [
      ...(profile.metadata.notes ?? []),
      `Promoted from ${profilePath} at ${timestamp}.`,
    ],
  });

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(approved, null, 2));

  console.log(JSON.stringify({
    promoted: true,
    outputPath,
    profileId: approved.metadata.profileId,
    profileVersion: approved.metadata.profileVersion,
    verification: approved.metadata.verification,
  }, null, 2));
}

main();
