import type { TextObject, TextSettings } from '@shader/core';
import { NumberField, Select } from '@shader/design-system';
import { useEffect, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { fitTextBox } from '../canvas/textRasterizer';
import { useEditorStore } from '../store/editorStore';
import { FONTS, isFontLoading, loadFont, weightsFor } from './fonts';
import styles from './Typography.module.css';

/**
 * The type controls for a text object.
 *
 * Arranged as the reference builder arranges them: the family across the top,
 * weight beside size, line height beside letter spacing, then alignment. Every
 * numeric field can be typed into, stepped with the arrow keys, or scrubbed by
 * dragging the glyph beside it — sliders would have matched the rest of the
 * panel but cost precision and a great deal of vertical room, and type is the
 * one place a value of 47 rather than 48 is worth being able to ask for.
 */

export interface TypographyProps {
  readonly object: TextObject;
}

const ALIGNMENTS = [
  { value: 'left', label: 'Align left', path: 'M2 4h12M2 8h7M2 12h10' },
  { value: 'center', label: 'Align centre', path: 'M2 4h12M4.5 8h7M3 12h10' },
  { value: 'right', label: 'Align right', path: 'M2 4h12M7 8h7M4 12h10' },
] as const;

// Lettering is filled, not stroked, and the icons around it set `fill="none"`
// for their outlines — so without a fill of its own this drew nothing at all.
const SIZE_GLYPH = (
  <text fill="currentColor" fontSize="10" stroke="none" x="1.5" y="12.5">
    Aa
  </text>
);
const LINE_HEIGHT_GLYPH = <path d="M2 2.6h12M2 13.4h12M5.4 11L8 5l2.6 6M6.2 9.4h3.6" />;
const LETTER_SPACING_GLYPH = <path d="M2.4 2.6v10.8M13.6 2.6v10.8M5.4 11L8 5l2.6 6M6.2 9.4h3.6" />;

export function Typography({ object }: TypographyProps) {
  const type = object.textSettings;

  // A family already in the document is fetched on sight, so reopening a file
  // does not leave its text in a fallback until somebody visits this panel.
  useEffect(() => {
    loadFont(type.fontFamily);
  }, [type.fontFamily]);

  const change = (changes: Partial<TextSettings>, label: string) => {
    const next = { ...type, ...changes };
    // The box has to follow the type. Larger, heavier, or more widely spaced
    // text needs more room, and a box left at its old size simply crops it.
    const box = fitTextBox(object.text, next, object.width);

    useEditorStore
      .getState()
      .updateObject(object.id, { textSettings: next, height: box.height }, label);
  };

  const weights = weightsFor(type.fontFamily);

  return (
    <section className={styles.typography}>
      <h3 className={styles.title}>Typography</h3>

      <Select
        label="Font"
        onValueChange={(fontFamily) => {
          loadFont(fontFamily);
          // A family may not have the weight the last one did; the nearest it
          // does have is closer to the author's intent than a silent fallback.
          const available = weightsFor(fontFamily);
          const nearest = available.reduce((best, weight) =>
            Math.abs(weight - type.fontWeight) < Math.abs(best - type.fontWeight) ? weight : best,
          );
          change({ fontFamily, fontWeight: nearest }, 'Change font');
        }}
        options={FONTS.map((font) => ({ value: font.id, label: font.label }))}
        value={type.fontFamily}
      />

      {isFontLoading(type.fontFamily) && (
        <p className={styles.loading} role="status">
          Fetching the font…
        </p>
      )}

      <div className={styles.pair}>
        <Select
          label="Weight"
          onValueChange={(weight) => {
            change({ fontWeight: Number(weight) }, 'Change weight');
          }}
          options={weights.map((weight) => ({ value: String(weight), label: weightName(weight) }))}
          value={String(type.fontWeight)}
        />

        <Scrub
          glyph={SIZE_GLYPH}
          onScrub={(steps) => {
            change({ fontSize: clamp(type.fontSize + steps, 1, 800) }, 'Change size');
          }}
          title="Drag to change the size"
        >
          <NumberField
            label="Size"
            max={800}
            min={1}
            onValueChange={(fontSize) => {
              change({ fontSize }, 'Change size');
            }}
            step={1}
            value={type.fontSize}
          />
        </Scrub>
      </div>

      <div className={styles.pair}>
        <Labelled text="Line height">
          <Scrub
            glyph={LINE_HEIGHT_GLYPH}
            onScrub={(steps) => {
              change(
                { lineHeight: clamp(round(type.lineHeight + steps * 0.02), 0.5, 4) },
                'Change line height',
              );
            }}
            title="Drag to change the line height"
          >
            <NumberField
              label="Line height"
              max={4}
              min={0.5}
              onValueChange={(lineHeight) => {
                change({ lineHeight }, 'Change line height');
              }}
              step={0.05}
              value={type.lineHeight}
            />
          </Scrub>
        </Labelled>

        <Labelled text="Letter spacing">
          <Scrub
            glyph={LETTER_SPACING_GLYPH}
            onScrub={(steps) => {
              change(
                { letterSpacing: clamp(round(type.letterSpacing + steps * 0.1), -20, 60) },
                'Change letter spacing',
              );
            }}
            title="Drag to change the letter spacing"
          >
            <NumberField
              label="Letter spacing"
              max={60}
              min={-20}
              onValueChange={(letterSpacing) => {
                change({ letterSpacing }, 'Change letter spacing');
              }}
              step={0.1}
              value={type.letterSpacing}
            />
          </Scrub>
        </Labelled>
      </div>

      <Labelled text="Alignment">
        <div className={styles.segmented} role="group">
          {ALIGNMENTS.map((option) => (
            <button
              aria-label={option.label}
              aria-pressed={type.align === option.value}
              className={styles.segment}
              key={option.value}
              onClick={() => {
                change({ align: option.value }, 'Change alignment');
              }}
              title={option.label}
              type="button"
            >
              <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
                <path d={option.path} />
              </svg>
            </button>
          ))}
        </div>
      </Labelled>
    </section>
  );
}

/** A field under a small heading, as the reference panel has. */
function Labelled({ text, children }: { readonly text: string; readonly children: ReactNode }) {
  return (
    <div className={styles.labelled}>
      <span className={styles.fieldLabel}>{text}</span>
      {children}
    </div>
  );
}

function weightName(weight: number): string {
  const names: Readonly<Record<number, string>> = {
    100: 'Thin',
    200: 'Extra light',
    300: 'Light',
    400: 'Regular',
    500: 'Medium',
    600: 'Semibold',
    700: 'Bold',
    800: 'Heavy',
    900: 'Black',
  };
  return names[weight] ?? String(weight);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Values are shown to a sensible precision rather than to floating-point noise. */
function round(value: number): number {
  return Number(value.toFixed(3));
}

/**
 * A field with a glyph you can drag sideways to change it.
 *
 * Dragging reaches a value far faster than typing does and far more precisely
 * than a slider, which is why every type tool has it. Two pixels of travel per
 * step is the rate that feels like turning a dial rather than sliding one.
 */
function Scrub({
  glyph,
  title,
  onScrub,
  children,
}: {
  readonly glyph: ReactNode;
  readonly title: string;
  readonly onScrub: (steps: number) => void;
  readonly children: ReactNode;
}) {
  const begin = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const element = event.currentTarget;
    const startX = event.clientX;
    let applied = 0;
    element.setPointerCapture(event.pointerId);
    event.preventDefault();

    const move = (moved: PointerEvent) => {
      const steps = Math.round((moved.clientX - startX) / 2);
      if (steps === applied) return;
      onScrub(steps - applied);
      applied = steps;
    };
    const end = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', end);
      element.removeEventListener('pointercancel', end);
    };

    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
  };

  return (
    <div className={styles.scrubRow}>
      <span aria-hidden="true" className={styles.scrubHandle} onPointerDown={begin} title={title}>
        <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
          {glyph}
        </svg>
      </span>
      <div className={styles.scrubField}>{children}</div>
    </div>
  );
}
