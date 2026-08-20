/**
 * WD14 model files on disk (no Electron).
 */
import { existsSync } from "node:fs";
import path from "node:path";

export const WD14_ONNX_NAMES = ["model.onnx", "wd-v1-4-moat-tagger.onnx"];
export const WD14_TAGS_NAME = "selected_tags.csv";

export function wd14ModelsReady(dir) {
  if (!dir || !existsSync(dir)) return false;
  const onnx = WD14_ONNX_NAMES.some((n) => existsSync(path.join(dir, n)));
  return onnx && existsSync(path.join(dir, WD14_TAGS_NAME));
}
