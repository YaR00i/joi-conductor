/**
 * Pure GPT-SoVITS layout helpers (no Electron app import — safe for vitest).
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const SOVITS_GITHUB_REPO = "https://github.com/RVC-Boss/GPT-SoVITS.git";
export const SOVITS_GITHUB_ZIP =
  "https://github.com/RVC-Boss/GPT-SoVITS/archive/refs/heads/main.zip";
export const SOVITS_PRETRAINED_REPO = "XXXXRT/GPT-SoVITS-Pretrained";
export const SOVITS_PRETRAINED_ZIP = "pretrained_models.zip";
export const SOVITS_G2PW_ZIP = "G2PWModel.zip";
export const SOVITS_NLTK_ZIP = "nltk_data.zip";
export const SOVITS_OPENJTALK_TGZ = "open_jtalk_dic_utf_8-1.11.tar.gz";
export const SOVITS_FFMPEG_REPO = "lj1995/VoiceConversionWebUI";

export function sovitsUserDataRoot(userData) {
  return path.join(userData, "gpt-sovits");
}

export function sovitsRepoDir(userData) {
  return path.join(sovitsUserDataRoot(userData), "repo");
}

export function sovitsVenvDir(userData) {
  return path.join(sovitsUserDataRoot(userData), "venv");
}

export function isSovitsRepo(dir) {
  if (!dir) return false;
  return existsSync(path.join(dir, "api_v2.py"));
}

export function pretrainedLooksReady(repoDir) {
  if (!repoDir) return false;
  const pre = path.join(repoDir, "GPT_SoVITS", "pretrained_models");
  if (!existsSync(pre)) return false;
  if (existsSync(path.join(pre, "sv"))) return true;
  try {
    return readdirSync(pre).some(
      (n) =>
        n.endsWith(".ckpt") ||
        n.endsWith(".pth") ||
        n.endsWith(".pt") ||
        n.endsWith(".onnx"),
    );
  } catch {
    return false;
  }
}

export function ffmpegLooksReady(repoDir, platform = process.platform) {
  if (!repoDir) return false;
  if (platform === "win32") {
    return existsSync(path.join(repoDir, "ffmpeg.exe"));
  }
  return existsSync(path.join(repoDir, "ffmpeg"));
}

export function extraReqPath(repoDir) {
  return path.join(repoDir, "extra-req.txt");
}

export function requirementsPath(repoDir) {
  return path.join(repoDir, "requirements.txt");
}
