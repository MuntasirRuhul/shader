import type { TokenSet } from './types';

/**
 * The single source of truth for every visual value in the product.
 *
 * Colors and shadows are themed; everything else is theme-invariant. The scale
 * is deliberately small — a token that is never used is a decision nobody made.
 */
export const tokens: TokenSet = {
  color: {
    // Surfaces, from the deepest canvas up to floating overlays.
    'surface-canvas': { light: '#f4f4f5', dark: '#0a0a0b' },
    'surface-panel': { light: '#ffffff', dark: '#141416' },
    'surface-raised': { light: '#ffffff', dark: '#1c1c1f' },
    'surface-overlay': { light: '#ffffff', dark: '#232327' },
    'surface-sunken': { light: '#ebebed', dark: '#08080a' },

    // Text.
    'text-primary': { light: '#18181b', dark: '#ececee' },
    'text-secondary': { light: '#52525b', dark: '#a1a1a8' },
    'text-muted': { light: '#8b8b93', dark: '#6e6e76' },
    'text-disabled': { light: '#b4b4bb', dark: '#4e4e56' },
    'text-on-accent': { light: '#ffffff', dark: '#ffffff' },

    // Borders.
    'border-subtle': { light: '#eaeaec', dark: '#232327' },
    'border-default': { light: '#dcdce0', dark: '#2e2e33' },
    'border-strong': { light: '#c2c2c8', dark: '#3d3d44' },

    // Accent — reserved for the primary action and the active state.
    'accent-solid': { light: '#3b6cf0', dark: '#4d7cff' },
    'accent-solid-hover': { light: '#2f5ad9', dark: '#6690ff' },
    'accent-subtle': { light: '#eaf0ff', dark: '#1a2340' },
    'accent-text': { light: '#2d55c9', dark: '#89a9ff' },
    'accent-border': { light: '#b9cbfb', dark: '#33406b' },

    // Focus ring — always distinct from the accent fill so it reads on top of it.
    'focus-ring': { light: '#3b6cf0', dark: '#6690ff' },

    // Controls.
    'control-track': { light: '#e4e4e8', dark: '#2a2a2f' },
    'control-thumb': { light: '#ffffff', dark: '#e8e8ea' },
    'control-fill': { light: '#3b6cf0', dark: '#4d7cff' },
    'control-hover': { light: '#f0f0f2', dark: '#26262b' },
    'control-selected': { light: '#e5ecff', dark: '#2e3550' },

    // Status.
    'danger-solid': { light: '#dc3d43', dark: '#e5484d' },
    'danger-text': { light: '#c62a2f', dark: '#ff9592' },
    'danger-subtle': { light: '#ffefef', dark: '#3b1219' },
    'success-solid': { light: '#299764', dark: '#30a46c' },
    'success-text': { light: '#18794e', dark: '#3dd68c' },
    'success-subtle': { light: '#e9f7ef', dark: '#0f291e' },
    'warning-solid': { light: '#f5a623', dark: '#ffb224' },
    'warning-text': { light: '#a35200', dark: '#ffca6f' },
    'warning-subtle': { light: '#fff5e5', dark: '#3b2400' },
  },

  space: {
    'space-0': '0',
    'space-1': '2px',
    'space-2': '4px',
    'space-3': '6px',
    'space-4': '8px',
    'space-5': '12px',
    'space-6': '16px',
    'space-7': '20px',
    'space-8': '24px',
    'space-9': '32px',
    'space-10': '40px',
    'space-11': '48px',
  },

  radius: {
    'radius-none': '0',
    'radius-sm': '4px',
    'radius-md': '6px',
    'radius-lg': '8px',
    'radius-xl': '12px',
    'radius-full': '9999px',
  },

  typography: {
    'font-sans':
      "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    'font-mono': "'SF Mono', ui-monospace, Menlo, Consolas, 'Liberation Mono', monospace",

    'font-size-xs': '10px',
    'font-size-sm': '11px',
    'font-size-md': '12px',
    'font-size-lg': '13px',
    'font-size-xl': '15px',
    'font-size-2xl': '18px',
    'font-size-3xl': '22px',

    'font-weight-regular': '400',
    'font-weight-medium': '500',
    'font-weight-semibold': '600',

    'line-height-tight': '1.2',
    'line-height-normal': '1.45',
    'line-height-relaxed': '1.7',

    'letter-spacing-tight': '-0.01em',
    'letter-spacing-normal': '0',
    'letter-spacing-wide': '0.04em',
  },

  elevation: {
    'shadow-sm': {
      light: '0 1px 2px rgba(16, 17, 26, 0.08)',
      dark: '0 1px 2px rgba(0, 0, 0, 0.5)',
    },
    'shadow-md': {
      light: '0 4px 12px rgba(16, 17, 26, 0.1)',
      dark: '0 4px 12px rgba(0, 0, 0, 0.55)',
    },
    'shadow-lg': {
      light: '0 12px 32px rgba(16, 17, 26, 0.14)',
      dark: '0 12px 32px rgba(0, 0, 0, 0.6)',
    },
    'shadow-popover': {
      light: '0 8px 24px rgba(16, 17, 26, 0.14), 0 2px 6px rgba(16, 17, 26, 0.08)',
      dark: '0 8px 24px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4)',
    },
  },

  motion: {
    'duration-instant': '75ms',
    'duration-fast': '120ms',
    'duration-normal': '180ms',
    'duration-slow': '280ms',

    'easing-standard': 'cubic-bezier(0.2, 0, 0.2, 1)',
    'easing-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
    'easing-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
  },
};
