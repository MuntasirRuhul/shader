import {
  isThemedTokenValue,
  THEME_NAMES,
  TOKEN_CATEGORIES,
  type TokenSet,
  type TokenValue,
} from './types';

export interface TokenValidationError {
  readonly category: string;
  readonly token: string;
  readonly message: string;
}

/**
 * A token name must be unique across categories, and a themed token must carry
 * a non-empty value for every theme. The build refuses to emit otherwise, so a
 * half-defined token can never reach a stylesheet.
 */
export function validateTokenSet(tokenSet: TokenSet): TokenValidationError[] {
  const errors: TokenValidationError[] = [];
  const seen = new Map<string, string>();

  for (const category of TOKEN_CATEGORIES) {
    const group: Record<string, TokenValue> = tokenSet[category];

    for (const [token, value] of Object.entries(group)) {
      const previousCategory = seen.get(token);
      if (previousCategory !== undefined) {
        errors.push({
          category,
          token,
          message: `Token name is already defined in the "${previousCategory}" category. Token names must be unique across categories.`,
        });
      } else {
        seen.set(token, category);
      }

      errors.push(...validateTokenValue(category, token, value));
    }
  }

  return errors;
}

function validateTokenValue(
  category: string,
  token: string,
  value: TokenValue,
): TokenValidationError[] {
  if (!isThemedTokenValue(value)) {
    if (typeof value !== 'string' || value.trim() === '') {
      return [{ category, token, message: 'Token value must be a non-empty string.' }];
    }
    return [];
  }

  const errors: TokenValidationError[] = [];
  for (const theme of THEME_NAMES) {
    const themeValue: string | undefined = value[theme];
    if (typeof themeValue !== 'string' || themeValue.trim() === '') {
      errors.push({
        category,
        token,
        message: `Missing a value for the "${theme}" theme. Every themed token must define both themes.`,
      });
    }
  }
  return errors;
}

export function formatValidationErrors(errors: readonly TokenValidationError[]): string {
  return errors.map((error) => `  ${error.category}.${error.token}: ${error.message}`).join('\n');
}

/** Throws when the token set is invalid. Used by the build to fail loudly. */
export function assertValidTokenSet(tokenSet: TokenSet): void {
  const errors = validateTokenSet(tokenSet);
  if (errors.length > 0) {
    throw new Error(
      `Token validation failed with ${String(errors.length)} error(s):\n${formatValidationErrors(errors)}`,
    );
  }
}
