import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.MONTAGE_DATA = mkdtempSync(path.join(os.tmpdir(), "montage-unit-"));
