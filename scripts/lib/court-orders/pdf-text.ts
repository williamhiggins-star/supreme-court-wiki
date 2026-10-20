import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Text of a Court PDF, columns kept, via `pdftotext -layout` (poppler-utils).
 *  pdf-parse drops docket digits in the two-column denial lists. */
export function pdfToText(pdf: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "order-"));
  try {
    const file = path.join(dir, "order.pdf");
    fs.writeFileSync(file, pdf);
    return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
