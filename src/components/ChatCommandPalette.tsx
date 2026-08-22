import {
  CHAT_COMMANDS,
  CHAT_COMMAND_GROUPS,
  chatCommandGroupLabelRu,
  type ChatCommandId,
} from "../lib/soul/control/commands";
import { playUiClick, primeUiAudio } from "../lib/uiSound";

type Props = {
  onPick: (id: ChatCommandId) => void;
};

export function ChatCommandPalette({ onPick }: Props) {
  return (
    <div className="chat-page__cmds" role="menu" aria-label="Команды чата">
      {CHAT_COMMAND_GROUPS.map((group) => (
        <section key={group} className="chat-page__cmds-group">
          <p className="chat-page__cmds-kicker">{chatCommandGroupLabelRu(group)}</p>
          <div className="chat-page__cmds-grid">
            {CHAT_COMMANDS.filter((cmd) => cmd.group === group).map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                role="menuitem"
                className="chat-page__cmd"
                title={cmd.hintRu}
                onClick={() => {
                  void primeUiAudio();
                  playUiClick();
                  onPick(cmd.id);
                }}
              >
                <span className="chat-page__cmd-slash">{cmd.slash}</span>
                <span className="chat-page__cmd-hint">{cmd.hintRu}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
