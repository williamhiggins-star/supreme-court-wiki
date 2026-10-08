/**
 * Loud SD write failures.
 *
 * Pipeline steps keep going when an SD write fails (the daily JSON commit
 * must still happen), but a failure must never pass as a success: each one
 * is printed as a GitHub Actions error annotation and appended to
 * $RUNNER_TEMP/sd-write-failures.log, and the workflow's last step fails
 * the run if that file is non-empty.
 */

import * as fs from "fs";
import * as path from "path";

export function reportSdWriteFailure(label: string, err: unknown): void {
  const message = `${label}: ${err instanceof Error ? err.message : String(err)}`;
  console.error(`::error title=SD database write failed::${message}`);
  const dir = process.env.RUNNER_TEMP;
  if (dir) fs.appendFileSync(path.join(dir, "sd-write-failures.log"), `${message}\n`);
}
