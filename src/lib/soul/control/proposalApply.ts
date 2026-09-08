import type { MistressId } from "../../mistress/types";
import { assignProgramContract } from "../../contracts/dailyBoard";
import { getContractDef } from "../../contracts/catalog";
import { applyControlActions } from "./actions";
import { closeSoulOpenLoops } from "../worldEvents";
import type { SoulMistressState } from "../types";
import type { AppliedControlResult } from "./types";
import type { ChatProposal } from "./proposals";
import type { ContractInstance } from "../../contracts/dailyBoard";
import { hasHardBoundaryOn } from "../stance";

export type ChatProposalAcceptResult = {
  soul: SoulMistressState;
  applied: AppliedControlResult | null;
  contract: ContractInstance | null;
  session: Extract<ChatProposal, { kind: "session" }> | null;
  blockedReason?: "hard_boundary";
};

function closeLinkedLoops(
  soul: SoulMistressState,
  proposal: ChatProposal,
): SoulMistressState {
  const candidateId = proposal.candidateId;
  if (!candidateId) return soul;
  const openLoops = closeSoulOpenLoops(soul.openLoops, (loop) => {
    if (candidateId === `loop:${loop.id}`) return true;
    if (candidateId === `event:${loop.id}`) return true;
    return false;
  });
  return { ...soul, openLoops };
}

export function acceptChatProposal(opts: {
  mistressId: MistressId;
  proposal: ChatProposal;
  soul: SoulMistressState;
}): ChatProposalAcceptResult {
  const proposal = opts.proposal;
  const boundarySubjects =
    proposal.kind === "session"
      ? ["session", proposal.sessionKind]
      : proposal.kind === "wear"
        ? [proposal.wearKind]
        : proposal.kind === "task"
          ? ["task", "contract"]
          : [proposal.kind];
  if (hasHardBoundaryOn(opts.soul.user.stances ?? [], boundarySubjects)) {
    return {
      soul: opts.soul,
      applied: null,
      contract: null,
      session: null,
      blockedReason: "hard_boundary",
    };
  }
  const soul = closeLinkedLoops(opts.soul, proposal);
  switch (proposal.kind) {
    case "wear": {
      const applied = applyControlActions(opts.mistressId, [
        { op: "set_wear", kind: proposal.wearKind, hours: proposal.hours },
      ]);
      return { soul, applied, contract: null, session: null };
    }
    case "denial": {
      const applied = applyControlActions(opts.mistressId, [
        {
          op: "set_denial",
          hours: proposal.hours,
          edges: proposal.edges,
        },
      ]);
      return { soul, applied, contract: null, session: null };
    }
    case "session": {
      return { soul, applied: null, contract: null, session: proposal };
    }
    case "task": {
      if (!getContractDef(proposal.defId)) {
        return { soul, applied: null, contract: null, session: null };
      }
      const contract = assignProgramContract(proposal.defId, proposal.params);
      return { soul, applied: null, contract, session: null };
    }
    case "checkin": {
      const applied = applyControlActions(opts.mistressId, [
        {
          op: "set_checkin",
          kind: proposal.checkInKind,
          hours: proposal.hours,
          note: proposal.note,
        },
      ]);
      return { soul, applied, contract: null, session: null };
    }
    default: {
      const _exhaustive: never = proposal;
      return _exhaustive;
    }
  }
}

export function refuseChatProposal(
  soul: SoulMistressState,
  _proposal: ChatProposal,
): SoulMistressState {
  return soul;
}
