import {
  defaultValues,
  type GroupParameter,
  type ParameterValue,
  type ParameterValues,
} from '@shader/core';
import { Button } from '@shader/design-system';
import styles from './GroupEditor.module.css';
import { ParameterRow } from './ParameterRow';

export interface GroupEditorProps {
  readonly parameter: GroupParameter;
  readonly entries: readonly ParameterValues[];
  readonly onChange: (entries: readonly ParameterValues[]) => void;
}

/**
 * Editing a repeatable group — mesh gradient poles, metaball balls.
 *
 * Entries can be added, removed, and reordered up to the declared maximum.
 * That ceiling is not a preference: the runtime binds a fixed-size uniform
 * array sized at compile time, so exceeding it would have nowhere to go.
 */
export function GroupEditor({ parameter, entries, onChange }: GroupEditorProps) {
  const atMaximum = entries.length >= parameter.maxEntries;
  const atMinimum = entries.length <= (parameter.minEntries ?? 0);

  const replaceEntry = (index: number, entry: ParameterValues) => {
    onChange(entries.map((existing, position) => (position === index ? entry : existing)));
  };

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= entries.length) return;

    const next = [...entries];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    onChange(next);
  };

  return (
    <div className={styles.group}>
      <ul className={styles.entries}>
        {entries.map((entry, index) => (
          // Entries have no identity of their own, so position is the key.
          <li className={styles.entry} key={index}>
            <div className={styles.entryHeader}>
              <span className={styles.entryLabel}>
                {parameter.label} {index + 1}
              </span>
              <div className={styles.entryActions}>
                <button
                  aria-label={`Move ${parameter.label} ${String(index + 1)} up`}
                  className={styles.entryAction}
                  disabled={index === 0}
                  onClick={() => {
                    move(index, -1);
                  }}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${parameter.label} ${String(index + 1)} down`}
                  className={styles.entryAction}
                  disabled={index === entries.length - 1}
                  onClick={() => {
                    move(index, 1);
                  }}
                  type="button"
                >
                  ↓
                </button>
                <button
                  aria-label={`Remove ${parameter.label} ${String(index + 1)}`}
                  className={styles.entryAction}
                  disabled={atMinimum}
                  onClick={() => {
                    onChange(entries.filter((_, position) => position !== index));
                  }}
                  type="button"
                >
                  ×
                </button>
              </div>
            </div>

            {parameter.entryParameters.map((entryParameter) => (
              <ParameterRow
                isDefault={
                  (entry[entryParameter.name] ?? entryParameter.defaultValue) ===
                  entryParameter.defaultValue
                }
                key={entryParameter.name}
                onChange={(value: ParameterValue) => {
                  replaceEntry(index, { ...entry, [entryParameter.name]: value });
                }}
                onReset={() => {
                  replaceEntry(index, {
                    ...entry,
                    [entryParameter.name]: entryParameter.defaultValue,
                  });
                }}
                parameter={entryParameter}
                value={entry[entryParameter.name] ?? entryParameter.defaultValue}
              />
            ))}
          </li>
        ))}
      </ul>

      <Button
        disabled={atMaximum}
        onClick={() => {
          onChange([...entries, defaultValues(parameter.entryParameters)]);
        }}
        size="sm"
        title={
          atMaximum
            ? `This shader supports at most ${String(parameter.maxEntries)} ${parameter.label.toLowerCase()}`
            : undefined
        }
      >
        Add {parameter.label.toLowerCase()}
      </Button>

      {atMaximum && (
        <p className={styles.limit}>
          At the limit of {parameter.maxEntries} — this shader allocates for a fixed number.
        </p>
      )}
    </div>
  );
}
