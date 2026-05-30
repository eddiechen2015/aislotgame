import { readFileSync } from "node:fs";
import path from "node:path";

import { MathProfileDocument, buildDefaultMathProfileDocument, normalizeMathProfileDocument } from "./mathProfile";
import { setRuntimeMathConfig } from "./mathRuntime";

const DEFAULT_ACTIVE_PROFILE = buildDefaultMathProfileDocument();

let activeProfile = DEFAULT_ACTIVE_PROFILE;

export interface MathProfileLoadOptions {
  requireApproved?: boolean;
}

export function getActiveMathProfileMetadata(): MathProfileDocument["metadata"] {
  return activeProfile.metadata;
}

export function getActiveMathProfileDocument(): MathProfileDocument {
  return activeProfile;
}

export function loadMathProfileDocument(profilePath: string): MathProfileDocument {
  const absolutePath = path.resolve(process.cwd(), profilePath);
  const parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  return normalizeMathProfileDocument(parsed, {
    source: `file:${absolutePath}`,
  });
}

export function assertProfileAllowedForRuntime(
  profile: MathProfileDocument,
  options: MathProfileLoadOptions = {},
): void {
  if (!options.requireApproved) return;

  if (profile.metadata.status !== "approved") {
    throw new Error(
      `runtime math profile must be approved when REQUIRE_APPROVED_PROFILE=true; got ${profile.metadata.status}`,
    );
  }

  if (!profile.metadata.verification?.passed) {
    throw new Error("runtime math profile must include passed verification metadata");
  }
}

export function installMathProfileDocument(
  profile: MathProfileDocument,
  options: MathProfileLoadOptions = {},
): void {
  assertProfileAllowedForRuntime(profile, options);
  setRuntimeMathConfig(profile.config);
  activeProfile = profile;
}

export function loadAndInstallMathProfile(
  profilePath: string,
  options: MathProfileLoadOptions = {},
): MathProfileDocument {
  const profile = loadMathProfileDocument(profilePath);
  installMathProfileDocument(profile, options);
  return profile;
}

export function requireApprovedProfileFromEnv(env = process.env): boolean {
  return env.REQUIRE_APPROVED_PROFILE === "true" || env.NODE_ENV === "production";
}

export function loadMathProfileFromEnv(
  env = process.env,
  options: MathProfileLoadOptions = {},
): MathProfileDocument {
  const profilePath = env.MATH_PROFILE_PATH;
  const requireApproved = options.requireApproved ?? requireApprovedProfileFromEnv(env);
  if (!profilePath) {
    installMathProfileDocument(DEFAULT_ACTIVE_PROFILE, { requireApproved });
    return DEFAULT_ACTIVE_PROFILE;
  }
  return loadAndInstallMathProfile(profilePath, { requireApproved });
}
