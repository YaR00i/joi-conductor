import { useCallback, useState } from "react";
import type { ChatProposal } from "../lib/soul/control/proposals";

/** Per-message validated cards. ChatPage must not parse regex here. */
export function useChatProposals() {
  const [byMessage, setByMessage] = useState<Record<string, ChatProposal[]>>(
    {},
  );

  const attach = useCallback((messageId: string, proposals: ChatProposal[]) => {
    if (!messageId || proposals.length === 0) return;
    setByMessage((prev) => ({
      ...prev,
      [messageId]: proposals,
    }));
  }, []);

  const dismiss = useCallback((messageId: string, proposalId: string) => {
    setByMessage((prev) => {
      const rows = (prev[messageId] ?? []).filter((row) => row.id !== proposalId);
      if (rows.length === (prev[messageId] ?? []).length) return prev;
      return { ...prev, [messageId]: rows };
    });
  }, []);

  const visibleFor = useCallback(
    (messageId: string): ChatProposal[] => byMessage[messageId] ?? [],
    [byMessage],
  );

  const clearAll = useCallback(() => setByMessage({}), []);

  return { attach, dismiss, visibleFor, clearAll };
}
