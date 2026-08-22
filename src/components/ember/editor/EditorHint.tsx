/**
 * Compact “?” hint. Keeps long help off the panel body; hover/focus shows it.
 */
type Props = {
  text: string;
};

export function EditorHint({ text }: Props) {
  return (
    <abbr className="ember-ed-tip" title={text}>
      ?
    </abbr>
  );
}
