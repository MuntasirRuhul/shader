/**
 * CSS Modules resolve to a map of class name to generated identifier. Declaring
 * the shape here lets TypeScript check `styles.foo` without a build step.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
