import type { MistressId } from "../../mistress/types";
import type { SoulMistressState, SoulUserMemory } from "../types";
import { huTaoSoulFacts } from "./catalog";

function looksUnseeded(user: SoulUserMemory): boolean {
  return (
    user.knownAttributes === "Unknown yet." ||
    user.roleInStory.includes("devotee she talks to")
  );
}

/** One-time Hu Tao life facts into Soul USER.md / topics. Other mistresses unchanged. */
export function seedSoulFactsIfEmpty(
  mistressId: MistressId,
  state: SoulMistressState,
): SoulMistressState {
  if (mistressId !== "hu_tao") return state;
  if (!looksUnseeded(state.user)) return state;
  const facts = huTaoSoulFacts();
  const topics = [...state.topics];
  for (const t of facts.topics) {
    if (topics.some((x) => x.filename === t.filename)) continue;
    topics.push({ filename: t.filename, body: t.body });
  }
  return {
    ...state,
    userMd: facts.userMd,
    user: {
      roleInStory: facts.user.roleInStory,
      knownAttributes: facts.user.knownAttributes,
      trustLevel: facts.user.trustLevel,
      dynamicDescription: facts.user.dynamicDescription,
      unspokenTension: facts.user.unspokenTension,
      preferencesHabits: [...facts.user.preferencesHabits],
      sharedMilestones: [...facts.user.sharedMilestones],
      stances: [...(state.user.stances ?? [])],
    },
    topics,
  };
}
