/**
 * Rejects literal color, spacing, radius, and typography values in component
 * styles so that every visual value resolves from a design token.
 *
 * The rule inspects string and numeric literals that reach a styling position:
 * a JSX `style` object, a `className`/`css` template, or an object property
 * whose key is a CSS property this rule governs. Token references —
 * `var(--sb-*)` and anything drawn from the token module — are allowed.
 */

const COLOR_PROPERTIES = new Set([
  'color',
  'background',
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'fill',
  'stroke',
  'boxShadow',
  'textShadow',
  'caretColor',
  'accentColor',
]);

const SPACING_PROPERTIES = new Set([
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'gap',
  'rowGap',
  'columnGap',
  'inset',
  'top',
  'right',
  'bottom',
  'left',
]);

const RADIUS_PROPERTIES = new Set([
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
]);

const TYPOGRAPHY_PROPERTIES = new Set([
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
]);

const CATEGORY_BY_PROPERTY = new Map();
for (const name of COLOR_PROPERTIES) CATEGORY_BY_PROPERTY.set(name, 'color');
for (const name of SPACING_PROPERTIES) CATEGORY_BY_PROPERTY.set(name, 'spacing');
for (const name of RADIUS_PROPERTIES) CATEGORY_BY_PROPERTY.set(name, 'radius');
for (const name of TYPOGRAPHY_PROPERTIES) CATEGORY_BY_PROPERTY.set(name, 'typography');

const COLOR_LITERAL = /(#[0-9a-f]{3,8}\b)|\b(rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\s*\(/i;
const LENGTH_LITERAL = /(^|[\s(,])-?\d*\.?\d+(px|rem|em|pt|ch|ex)\b/i;

/** Values that carry no design decision, so they need no token. */
const ALLOWED_KEYWORDS = new Set([
  '0',
  'auto',
  'none',
  'inherit',
  'initial',
  'unset',
  'revert',
  'currentColor',
  'transparent',
  'normal',
  '100%',
  '50%',
  'fit-content',
  'max-content',
  'min-content',
]);

function referencesToken(value) {
  return value.includes('var(--sb-');
}

function isAllowedValue(value) {
  const trimmed = value.trim();
  if (trimmed === '') return true;
  if (ALLOWED_KEYWORDS.has(trimmed)) return true;
  if (referencesToken(trimmed)) return true;
  // Percentages and unitless ratios express layout intent, not a design value.
  if (/^-?\d*\.?\d+%$/.test(trimmed)) return true;
  return false;
}

function offendingCategory(property, rawValue) {
  const category = CATEGORY_BY_PROPERTY.get(property);
  if (!category) return null;

  const value = String(rawValue);
  if (isAllowedValue(value)) return null;

  if (category === 'color') {
    return COLOR_LITERAL.test(value) ? 'color' : null;
  }
  if (category === 'typography') {
    // Font sizes and line heights are lengths; families and weights are words.
    if (LENGTH_LITERAL.test(value)) return 'typography';
    if (property === 'fontWeight' && /^\d+$/.test(value.trim())) return 'typography';
    if (property === 'fontFamily') return 'typography';
    return null;
  }
  return LENGTH_LITERAL.test(value) ? category : null;
}

/** Numeric literals in a style object are implicit pixels in React. */
function offendingNumeric(property, value) {
  const category = CATEGORY_BY_PROPERTY.get(property);
  if (!category || value === 0) return null;
  if (category === 'color') return null;
  return category;
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require design tokens instead of literal color, spacing, radius, and typography values.',
    },
    schema: [],
    messages: {
      literalValue:
        'Use a design token instead of a literal {{category}} value ({{value}}). Reference a token with var(--sb-…).',
    },
  },

  create(context) {
    function report(node, category, value) {
      context.report({
        node,
        messageId: 'literalValue',
        data: { category, value: String(value) },
      });
    }

    function checkObjectProperty(property) {
      if (property.type !== 'Property' || property.computed) return;

      const key =
        property.key.type === 'Identifier'
          ? property.key.name
          : property.key.type === 'Literal'
            ? String(property.key.value)
            : null;
      if (!key) return;

      const value = property.value;
      if (value.type === 'Literal') {
        if (typeof value.value === 'string') {
          const category = offendingCategory(key, value.value);
          if (category) report(value, category, value.value);
        } else if (typeof value.value === 'number') {
          const category = offendingNumeric(key, value.value);
          if (category) report(value, category, value.value);
        }
        return;
      }

      // Template literals with no interpolation are just strings.
      if (value.type === 'TemplateLiteral' && value.expressions.length === 0) {
        const text = value.quasis.map((quasi) => quasi.value.cooked ?? '').join('');
        const category = offendingCategory(key, text);
        if (category) report(value, category, text);
      }
    }

    return {
      'JSXAttribute[name.name="style"] ObjectExpression > Property': checkObjectProperty,
      'VariableDeclarator[id.name=/[Ss]tyles?$/] ObjectExpression > Property': checkObjectProperty,
      'CallExpression[callee.name=/^(css|styled)$/] ObjectExpression > Property':
        checkObjectProperty,
    };
  },
};

export default {
  rules: {
    'no-literal-design-values': rule,
  },
};
