import type { LeafParameter, ParameterValue } from '@shader/core';
import { ParameterControl } from './ParameterControl';
import styles from './ParameterRow.module.css';

export interface ParameterRowProps {
  readonly parameter: LeafParameter;
  readonly value: ParameterValue;
  readonly isDefault: boolean;
  readonly onChange: (value: ParameterValue) => void;
  readonly onCommit?: (value: ParameterValue) => void;
  readonly onReset: () => void;
}

/** A labelled parameter with its control and a reset affordance. */
export function ParameterRow({
  parameter,
  value,
  isDefault,
  onChange,
  onCommit,
  onReset,
}: ParameterRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.header}>
        <span className={styles.label}>{parameter.label}</span>
        <button
          className={styles.reset}
          disabled={isDefault}
          onClick={onReset}
          title={isDefault ? 'Already at its default' : 'Reset to default'}
          type="button"
        >
          {isDefault ? 'Default' : 'Reset'}
        </button>
      </div>

      <ParameterControl
        onChange={onChange}
        parameter={parameter}
        value={value}
        {...(onCommit ? { onCommit } : {})}
      />

      {parameter.description !== undefined && (
        <p className={styles.description}>{parameter.description}</p>
      )}
    </div>
  );
}
