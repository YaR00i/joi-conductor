/**
 * WD14 model files on disk (no Electron).
 */
import { existsSync } from "node:fs";
import path from "node:path";

export const WD14_ONNX_NAMES = ["model.onnx", "wd-v1-4-moat-tagger.onnx"];
export const WD14_TAGS_NAME = "selected_tags.csv";

/** Public MoAT v2. The old `wd-v1-4-moat-tagger.onnx` URL now returns HTTP 401. */
export const WD14_ONNX_URLS = [
  "https://huggingface.co/SmilingWolf/wd-v1-4-moat-tagger-v2/resolve/main/model.onnx?download=true",
  "https://huggingface.co/lllyasviel/misc/resolve/main/wd-v1-4-moat-tagger-v2.onnx?download=true",
];
export const WD14_TAGS_URLS = [
  "https://huggingface.co/SmilingWolf/wd-v1-4-moat-tagger-v2/resolve/main/selected_tags.csv?download=true",
  "https://huggingface.co/lllyasviel/misc/resolve/main/wd-v1-4-moat-tagger-v2.csv?download=true",
];

export function wd14ModelsReady(dir) {
  if (!dir || !existsSync(dir)) return false;
  const onnx = WD14_ONNX_NAMES.some((n) => existsSync(path.join(dir, n)));
  return onnx && existsSync(path.join(dir, WD14_TAGS_NAME));
}
