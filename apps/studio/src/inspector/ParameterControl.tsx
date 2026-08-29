import { type LeafParameter, type ParameterValue, type Vector2Value } from '@shader/core';
import { ColorField, NumberField, Select, Slider, Toggle } from '@shader/design-system';
import styles from './ParameterControl.module.css';

export interface ParameterControlProps {
  readonly parameter: LeafParameter;
  readonly value: ParameterValue;
  readonly disabled?: boolean;
  /** Fires continuously, e.g. while a slider is dragged. */
  readonly onChange: (value: ParameterValue) => void;
  /** Fires once at the end of a continuous change. */
  readonly onCommit?: (value: ParameterValue) => void;
}

/**
 * The control for one parameter, chosen by its declared type.
 *
 * This is the only place that maps a type to a control. Nothing here knows
 * which shader it is serving — that is what lets a shader registered later
 * render a complete panel with no change to the inspector.
 */
export function ParameterControl({
  parameter,
  value,
  disabled = false,
  onChange,
  onCommit,
}: ParameterControlProps) {
  switch (parameter.type) {
    case 'number': {
      const numeric = typeof value === 'number' ? value : parameter.defaultValue;
      return (
        <div className={styles.numberRow}>
          <Slider
            disabled={disabled}
            label={parameter.label}
            max={parameter.max}
            min={parameter.min}
            onChange={onChange}
            step={parameter.step}
            value={numeric}
            {...(onCommit
              ? {
                  onCommit: (next: number) => {
                    onCommit(next);
                  },
                }
              : {})}
          />
          <NumberField
            className={styles.numberEntry}
            disabled={disabled}
            integer={parameter.integer ?? false}
            label={`${parameter.label} value`}
            max={parameter.max}
            min={parameter.min}
            onValueChange={(next) => {
              onChange(next);
              onCommit?.(next);
            }}
            step={parameter.step}
            value={numeric}
          />
        </div>
      );
    }

    case 'boolean':
      return (
        <Toggle
          checked={typeof value === 'boolean' ? value : parameter.defaultValue}
          disabled={disabled}
          label={parameter.label}
          onCheckedChange={(next) => {
            onChange(next);
            onCommit?.(next);
          }}
        />
      );

    case 'color':
      return (
        <ColorField
          disabled={disabled}
          label={parameter.label}
          onValueChange={(next) => {
            onChange(next);
            onCommit?.(next);
          }}
          value={typeof value === 'string' ? value : parameter.defaultValue}
        />
      );

    case 'enum':
      return (
        <Select
          disabled={disabled}
          label={parameter.label}
          onValueChange={(next) => {
            onChange(next);
            onCommit?.(next);
          }}
          options={parameter.options}
          value={typeof value === 'string' ? value : parameter.defaultValue}
        />
      );

    case 'vector2': {
      const vector = isVector(value) ? value : parameter.defaultValue;
      const setAxis = (axis: 'x' | 'y') => (next: number) => {
        const updated = { ...vector, [axis]: next };
        onChange(updated);
        onCommit?.(updated);
      };

      return (
        <div className={styles.vectorRow}>
          <NumberField
            disabled={disabled}
            label={`${parameter.label} X`}
            max={parameter.max.x}
            min={parameter.min.x}
            onValueChange={setAxis('x')}
            step={parameter.step}
            value={vector.x}
          />
          <NumberField
            disabled={disabled}
            label={`${parameter.label} Y`}
            max={parameter.max.y}
            min={parameter.min.y}
            onValueChange={setAxis('y')}
            step={parameter.step}
            value={vector.y}
          />
        </div>
      );
    }
  }
}

function isVector(value: unknown): value is Vector2Value {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Vector2Value).x === 'number' &&
    typeof (value as Vector2Value).y === 'number'
  );
}
