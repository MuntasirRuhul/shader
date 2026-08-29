/** Joins truthy class names. Keeps conditional styling readable at call sites. */
export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}
