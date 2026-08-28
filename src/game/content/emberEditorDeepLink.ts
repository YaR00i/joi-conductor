export type EmberVoxelEditorDeepLink = {
  modelId: string;
  workspace: "material";
  tool: "emit" | "transparency";
};

const SAFE_MODEL_ID = /^[a-zA-Z0-9_-]+$/;

/** URL contract used by the Godot migration dock. No content/schema state lives here. */
export function parseEmberVoxelEditorDeepLink(
  search: string,
): EmberVoxelEditorDeepLink | null {
  const params = new URLSearchParams(search);
  if (params.get("emberEditor") !== "voxel") return null;
  const modelId = params.get("modelId")?.trim() ?? "";
  if (!SAFE_MODEL_ID.test(modelId)) return null;
  if (params.get("workspace") !== "material") return null;
  const tool = params.get("tool");
  if (tool !== "emit" && tool !== "transparency") return null;
  return { modelId, workspace: "material", tool };
}
