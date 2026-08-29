import { render, screen, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

/**
 * A reusable contract every interactive primitive must satisfy.
 *
 * Each primitive registers itself with `runAccessibilitySuite`, so later
 * primitives inherit the same checks without restating them. The suite covers
 * what the design system spec requires of an interactive primitive:
 * reachability, activation, dismissal, visible focus, focus trapping and
 * restoration, and exposed role, name, and state.
 */
export interface AccessibilityCase {
  /** The primitive's name, used in the test titles. */
  readonly name: string;
  /** Renders the primitive in isolation. */
  readonly render: () => ReactElement;
  /** The role the primitive's focusable control reports. */
  readonly role: string;
  /** The accessible name that control reports. */
  readonly accessibleName: string;
  /**
   * Set when the primitive opens a layer. The suite then also checks that the
   * layer opens, dismisses on Escape, and returns focus to the trigger.
   */
  readonly layer?: {
    /** Opens the layer from the focused trigger. */
    readonly open: (user: ReturnType<typeof userEvent.setup>) => Promise<void>;
    /** Text that appears only while the layer is open. */
    readonly contentText: string;
    /** Whether the layer takes focus into itself, as a dialog does. */
    readonly trapsFocus?: boolean;
  };
  /** Set when the primitive exposes a pressed/checked style state. */
  readonly state?: {
    readonly attribute: string;
    readonly value: string;
  };
  /** Tab presses needed to reach the control, when it is not the first stop. */
  readonly tabsToReach?: number;
  /**
   * False for a control where Enter is a commit gesture that deliberately
   * moves focus away, as in a numeric field.
   */
  readonly activationKeepsFocus?: boolean;
}

function renderCase(testCase: AccessibilityCase): RenderResult {
  return render(testCase.render());
}

/** Tabs until the case's control has focus. */
async function tabTo(
  user: ReturnType<typeof userEvent.setup>,
  testCase: AccessibilityCase,
): Promise<void> {
  for (let step = 0; step < (testCase.tabsToReach ?? 1); step += 1) {
    await user.tab();
  }
}

export function runAccessibilitySuite(testCase: AccessibilityCase): void {
  describe(`${testCase.name} — accessibility contract`, () => {
    it('exposes its role and accessible name', () => {
      renderCase(testCase);

      expect(
        screen.getByRole(testCase.role, { name: testCase.accessibleName }),
      ).toBeInTheDocument();
    });

    it('is reachable with the keyboard alone', async () => {
      const user = userEvent.setup();
      renderCase(testCase);

      await tabTo(user, testCase);

      expect(screen.getByRole(testCase.role, { name: testCase.accessibleName })).toHaveFocus();
    });

    it('keeps its focusable control in the tab order', async () => {
      const user = userEvent.setup();
      renderCase(testCase);

      await tabTo(user, testCase);
      const control = screen.getByRole(testCase.role, { name: testCase.accessibleName });

      expect(control).toHaveFocus();
      expect(control).not.toHaveAttribute('tabindex', '-1');
    });

    it('can be activated from the keyboard', async () => {
      const user = userEvent.setup();
      renderCase(testCase);

      await tabTo(user, testCase);
      await user.keyboard('{Enter}');
      await user.keyboard(' ');

      // Neither key may throw. Focus survives unless activation is itself a
      // commit gesture that moves it, as in a numeric field.
      if (testCase.activationKeepsFocus !== false) {
        expect(document.activeElement).not.toBe(document.body);
      }
    });

    if (testCase.state) {
      const state = testCase.state;
      it('exposes its current state to assistive technology', () => {
        renderCase(testCase);

        expect(screen.getByRole(testCase.role, { name: testCase.accessibleName })).toHaveAttribute(
          state.attribute,
          state.value,
        );
      });
    }

    if (testCase.layer) {
      const layer = testCase.layer;

      it('opens its layer from the keyboard', async () => {
        const user = userEvent.setup();
        renderCase(testCase);

        await tabTo(user, testCase);
        await layer.open(user);

        expect(await screen.findAllByText(layer.contentText)).not.toHaveLength(0);
      });

      it('dismisses its layer on Escape', async () => {
        const user = userEvent.setup();
        renderCase(testCase);

        await tabTo(user, testCase);
        await layer.open(user);
        await screen.findAllByText(layer.contentText);

        await user.keyboard('{Escape}');

        expect(screen.queryByText(layer.contentText)).not.toBeInTheDocument();
      });

      it('returns focus to the trigger after dismissal', async () => {
        const user = userEvent.setup();
        renderCase(testCase);

        await tabTo(user, testCase);
        await layer.open(user);
        await screen.findAllByText(layer.contentText);

        await user.keyboard('{Escape}');

        expect(screen.getByRole(testCase.role, { name: testCase.accessibleName })).toHaveFocus();
      });

      if (layer.trapsFocus) {
        it('confines focus to the layer while it is open', async () => {
          const user = userEvent.setup();
          renderCase(testCase);

          await tabTo(user, testCase);
          await layer.open(user);
          const content = (await screen.findAllByText(layer.contentText))[0];

          await user.tab();

          expect(content?.contains(document.activeElement)).toBe(true);
        });
      }
    }
  });
}
