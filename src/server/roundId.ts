import { randomBytes } from "crypto";

export function createRoundId(): string {
  const timestamp = Date.now().toString(36);
  const entropy = randomBytes(8).toString("hex");
  return `round_${timestamp}_${entropy}`;
}
