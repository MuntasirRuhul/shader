import {
  DOCUMENT_VERSION,
  OBJECT_TYPES,
  type CanvasDocument,
  type CanvasObject,
} from '../document/model';

/**
 * Reading and writing documents.
 *
 * A document carries its format version, and loading runs it forward through
 * a chain of small migrations. A version newer than this build is refused
 * outright rather than read partially: a half-understood document is worse
 * than one that plainly will not open.
 */

export type LoadFailure =
  | { readonly kind: 'unparseable'; readonly message: string }
  | { readonly kind: 'not-a-document'; readonly message: string }
  | {
      readonly kind: 'future-version';
      readonly documentVersion: number;
      readonly supportedVersion: number;
      readonly message: string;
    }
  | {
      readonly kind: 'unknown-object-type';
      readonly objectType: string;
      readonly message: string;
    };

export type LoadResult =
  | { readonly ok: true; readonly document: CanvasDocument; readonly migrated: boolean }
  | { readonly ok: false; readonly failure: LoadFailure };

/**
 * Migrations from one version to the next.
 *
 * Keyed by the version being migrated *from*. A chain of small, individually
 * testable steps is far easier to keep correct than one function that must
 * understand every historical shape at once.
 */
export const migrations: Readonly<Record<number, (document: RawDocument) => RawDocument>> = {
  // Version 1 is the first format, so there is nothing to migrate from yet.
  // A future version 2 would add: 1: (document) => ({ ...document, version: 2, … }).
};

/** A document as it arrives from storage, before it is known to be valid. */
export type RawDocument = Record<string, unknown>;

export function serializeDocument(document: CanvasDocument): string {
  return JSON.stringify(document, null, 2);
}

/** Parses and validates a document from its serialized form. */
export function deserializeDocument(raw: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: 'unparseable',
        message: `This file is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }

  return loadDocument(parsed);
}

/** Validates and migrates an already-parsed document. */
export function loadDocument(parsed: unknown): LoadResult {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      failure: { kind: 'not-a-document', message: 'This file does not contain a document.' },
    };
  }

  const raw = parsed as RawDocument;
  const version = raw['version'];

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return {
      ok: false,
      failure: {
        kind: 'not-a-document',
        message: 'This file does not declare a document format version.',
      },
    };
  }

  if (version > DOCUMENT_VERSION) {
    return {
      ok: false,
      failure: {
        kind: 'future-version',
        documentVersion: version,
        supportedVersion: DOCUMENT_VERSION,
        message: `This document was saved in format version ${String(version)}, but this version of the application understands up to version ${String(DOCUMENT_VERSION)}. Update the application to open it.`,
      },
    };
  }

  const migrated = version < DOCUMENT_VERSION;
  const upgraded = migrate(raw, version);
  if (!upgraded.ok) return upgraded;

  return validateDocument(upgraded.document, migrated);
}

function migrate(
  raw: RawDocument,
  fromVersion: number,
): { ok: true; document: RawDocument } | { ok: false; failure: LoadFailure } {
  let current = raw;

  for (let version = fromVersion; version < DOCUMENT_VERSION; version += 1) {
    const step = migrations[version];
    if (!step) {
      return {
        ok: false,
        failure: {
          kind: 'not-a-document',
          message: `No migration exists from format version ${String(version)}.`,
        },
      };
    }
    current = step(current);
  }

  return { ok: true, document: current };
}

const knownTypes = new Set<string>(OBJECT_TYPES);

function validateDocument(raw: RawDocument, migrated: boolean): LoadResult {
  const objects = raw['objects'];
  if (!Array.isArray(objects)) {
    return {
      ok: false,
      failure: { kind: 'not-a-document', message: 'This document has no objects list.' },
    };
  }

  for (const candidate of objects) {
    if (typeof candidate !== 'object' || candidate === null) {
      return {
        ok: false,
        failure: { kind: 'not-a-document', message: 'This document contains an invalid object.' },
      };
    }

    const objectType = (candidate as Record<string, unknown>)['type'];
    if (typeof objectType !== 'string' || !knownTypes.has(objectType)) {
      // Discarding it silently would lose the user's work without telling them.
      return {
        ok: false,
        failure: {
          kind: 'unknown-object-type',
          objectType: String(objectType),
          message: `This document contains an object of an unrecognised type: "${String(objectType)}". It was made by a different or newer version of the application.`,
        },
      };
    }
  }

  return {
    ok: true,
    document: raw as unknown as CanvasDocument,
    migrated,
  };
}

/** Whether two documents hold the same content, for round-trip checks. */
export function documentsEqual(a: CanvasDocument, b: CanvasDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A filename for an exported document. */
export function exportFilename(document: CanvasDocument): string {
  const safe = document.name
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '');
  return `${safe === '' ? 'shader-document' : safe.toLowerCase()}.shader.json`;
}

export type { CanvasObject };
