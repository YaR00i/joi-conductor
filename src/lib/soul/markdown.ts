import type { SoulCharacterMemory, SoulUserMemory } from "./types";
import { stripThinkBlocks } from "./llmSettings";
import { everydayHabitsFrom } from "./stance";

function bullets(lines: string[]): string {
  if (lines.length === 0) return "- (none yet)";
  return lines.map((line) => `- ${line.trim()}`).join("\n");
}

export function characterMemoryToMd(memory: SoulCharacterMemory): string {
  return [
    "# Character memory",
    "",
    "## Core identity",
    bullets(memory.coreIdentity),
    "",
    "## Internal state",
    `- Primary emotion: ${memory.primaryEmotion}`,
    `- Intensity: ${memory.intensity}`,
    `- Psychological tension: ${memory.psychologicalTension}`,
    `- Emotional decay counter: ${memory.emotionalDecayCounter}`,
    "",
    "## Cognitive drive",
    `- Active agenda: ${memory.activeAgenda}`,
    `- Immediate focus: ${memory.immediateFocus}`,
    "",
    "## Cognitive dissonance",
    memory.cognitiveDissonance.trim() || "None",
    "",
  ].join("\n");
}

export function userMemoryToMd(memory: SoulUserMemory): string {
  return [
    "# User memory",
    "",
    "## Identity",
    `- Role in story: ${memory.roleInStory}`,
    `- Known attributes: ${memory.knownAttributes}`,
    "",
    "## Relationship dynamic",
    `- Trust level: ${memory.trustLevel}`,
    `- Dynamic: ${memory.dynamicDescription}`,
    `- Unspoken tension: ${memory.unspokenTension}`,
    "",
    "## Preferences and habits",
    bullets(memory.preferencesHabits),
    "",
    "## Shared milestones",
    bullets(memory.sharedMilestones),
    "",
  ].join("\n");
}

/** Chat/router USER slice: drop legacy play lines that now live in stances. */
export function userMemoryToPromptMd(memory: SoulUserMemory): string {
  return userMemoryToMd({
    ...memory,
    preferencesHabits: everydayHabitsFrom(memory.preferencesHabits),
  });
}

export function formatDiaryStamp(atMs: number): string {
  const d = new Date(atMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function appendDiaryEntry(
  diaryMd: string,
  body: string,
  atMs: number,
): string {
  const stamp = formatDiaryStamp(atMs);
  const cleaned = stripThinkBlocks(body.replace(/[*"`]/g, "")).trim();
  if (!cleaned) return diaryMd;
  const block = `## ${stamp}\n\n${cleaned}\n`;
  const prev = diaryMd.trim();
  return prev ? `${prev}\n\n${block}` : block;
}

export function lastDiaryExcerpt(diaryMd: string, maxChars = 280): string {
  const trimmed = diaryMd.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/^## /m).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const match = parts[i]!.match(/^(\d{4}-\d{2}-\d{2})\s*([\s\S]*)$/);
    const stamp = match?.[1] ?? "";
    const last = stripThinkBlocks((match?.[2] ?? parts[i]!).trim());
    if (!last) continue;
    const shown = stamp ? `${stamp}\n${last}` : last;
    if (shown.length <= maxChars) return shown;
    return `${shown.slice(0, maxChars).trim()}…`;
  }
  return "";
}

export function clampTopicBody(body: string, maxWords = 300): string {
  const words = body.trim().split(/\s+/u).filter(Boolean);
  if (words.length <= maxWords) return body.trim();
  return `${words.slice(0, maxWords).join(" ")}…`;
}

export function soulTopicFilename(raw: string): string {
  const base = raw
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return `${base || "topic"}.md`;
}
