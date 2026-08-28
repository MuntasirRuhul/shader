import { RuleTester } from 'eslint';
import { afterAll, describe, it } from 'vitest';
import plugin from './no-literal-design-values.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const rule = plugin.rules['no-literal-design-values'];

ruleTester.run('no-literal-design-values', rule, {
  valid: [
    { code: 'const a = <div style={{ color: "var(--sb-text-primary)" }} />;' },
    { code: 'const a = <div style={{ padding: "var(--sb-space-5)" }} />;' },
    { code: 'const a = <div style={{ margin: 0 }} />;' },
    { code: 'const a = <div style={{ borderRadius: "0" }} />;' },
    { code: 'const a = <div style={{ color: "transparent" }} />;' },
    { code: 'const a = <div style={{ color: "currentColor" }} />;' },
    { code: 'const a = <div style={{ left: "50%" }} />;' },
    // Properties outside the governed categories carry no design decision.
    { code: 'const a = <div style={{ display: "flex", zIndex: 10 }} />;' },
    { code: 'const a = <div style={{ width: "100%" }} />;' },
    // Values built from tokens are still token references.
    { code: 'const a = <div style={{ padding: "calc(var(--sb-space-5) * 2)" }} />;' },
    // Objects that are not styles are untouched.
    { code: 'const config = { color: "#ff0000" };' },
  ],

  invalid: [
    {
      code: 'const a = <div style={{ color: "#ff0088" }} />;',
      errors: [{ messageId: 'literalValue', data: { category: 'color', value: '#ff0088' } }],
    },
    {
      code: 'const a = <div style={{ backgroundColor: "rgb(255, 0, 136)" }} />;',
      errors: [{ messageId: 'literalValue' }],
    },
    {
      code: 'const a = <div style={{ padding: "13px" }} />;',
      errors: [{ messageId: 'literalValue', data: { category: 'spacing', value: '13px' } }],
    },
    {
      code: 'const a = <div style={{ gap: "1rem" }} />;',
      errors: [{ messageId: 'literalValue' }],
    },
    {
      code: 'const a = <div style={{ borderRadius: "7px" }} />;',
      errors: [{ messageId: 'literalValue', data: { category: 'radius', value: '7px' } }],
    },
    {
      code: 'const a = <div style={{ fontSize: "17px" }} />;',
      errors: [{ messageId: 'literalValue', data: { category: 'typography', value: '17px' } }],
    },
    {
      code: 'const a = <div style={{ fontFamily: "Helvetica, sans-serif" }} />;',
      errors: [{ messageId: 'literalValue' }],
    },
    {
      code: 'const a = <div style={{ fontWeight: "700" }} />;',
      errors: [{ messageId: 'literalValue' }],
    },
    {
      // React turns a bare number into pixels, so it is still a literal length.
      code: 'const a = <div style={{ padding: 13 }} />;',
      errors: [{ messageId: 'literalValue' }],
    },
    {
      code: 'const a = <div style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.5)" }} />;',
      errors: [{ messageId: 'literalValue' }],
    },
    {
      // A named styles object is a styling position too.
      code: 'const panelStyles = { color: "#123456" };',
      errors: [{ messageId: 'literalValue' }],
    },
    {
      code: 'const a = <div style={{ color: "#fff", padding: "9px" }} />;',
      errors: [{ messageId: 'literalValue' }, { messageId: 'literalValue' }],
    },
  ],
});
