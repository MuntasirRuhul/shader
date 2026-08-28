/**
 * Component stylesheets must resolve every visual value from a design token.
 * `scale-unlimited/declaration-strict-value` fails any declaration of a governed
 * property whose value is not a `var(--…)` reference.
 *
 * The generated token stylesheet is the one place literals are expected, so it
 * is ignored here — it is produced from the typed token source, which has its
 * own validation.
 */
export default {
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-declaration-strict-value'],
  ignoreFiles: ['**/generated/**', '**/dist/**', '**/node_modules/**'],
  rules: {
    'scale-unlimited/declaration-strict-value': [
      [
        // color
        'color',
        'background-color',
        'border-color',
        'border-top-color',
        'border-right-color',
        'border-bottom-color',
        'border-left-color',
        'outline-color',
        'fill',
        'stroke',
        'box-shadow',
        // spacing
        'margin',
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
        'padding',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'gap',
        'row-gap',
        'column-gap',
        // radius
        'border-radius',
        // typography
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'letter-spacing',
        // motion
        'transition-duration',
        'animation-duration',
      ],
      {
        ignoreValues: [
          '0',
          'auto',
          'none',
          'inherit',
          'initial',
          'unset',
          'currentColor',
          'transparent',
          'normal',
          'bold',
          '/^-?\\d+%$/',
        ],
        disableFix: true,
        message:
          'Use a design token for this value. Reference a token with var(--sb-…) instead of a literal.',
      },
    ],
    // CSS Modules use camelCase class names so they read naturally from TS.
    'selector-class-pattern': '^[a-z][a-zA-Z0-9]*$',
    'custom-property-pattern': null,
    'declaration-empty-line-before': null,
  },
};
