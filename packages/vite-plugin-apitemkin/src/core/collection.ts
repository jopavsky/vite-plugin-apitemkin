import { randomUUID } from 'node:crypto';
import type { ApitemkinHandler, ApitemkinRequest, RichResponse } from './runtime.js';

export type CollectionId = string | number;

export interface CollectionOptions<T> {
  /** Field that holds the id. Default `'id'`. */
  idKey?: keyof T & string;
  /**
   * Id for a POSTed record that has none. Default: numeric seeds (or an empty
   * seed) count up from the highest id ever seen; otherwise a random UUID.
   */
  newId?: (records: T[]) => CollectionId;
  /** Shape of one-liner success bodies, e.g. `(body) => ({ data: body })`. */
  wrap?: (body: unknown) => unknown;
}

/**
 * An in-memory list of records, defined in a folder's `_data.ts` file and shared by
 * every route file that imports it. Resets when that file is saved, when the
 * dev server restarts, or from the overlay. Never written to disk.
 */
export interface Collection<T extends object> {
  // ---- one-liners: built-in REST behavior for a route file ----
  /** `index.ts`: 200 with every record. */
  list(): ApitemkinHandler;
  /** `[id].ts`: 200 with the record, 404 for an unknown id. */
  get(): ApitemkinHandler;
  /** `index.post.ts`: 201 with the stored record (id assigned if missing). */
  create(): ApitemkinHandler;
  /** `[id].put.ts`: 200 with the replaced record; the URL id wins. */
  replace(): ApitemkinHandler;
  /** `[id].patch.ts`: 200 with the record shallow-merged with the body. */
  update(): ApitemkinHandler;
  /** `[id].delete.ts`: 204, or 404 for an unknown id. */
  remove(): ApitemkinHandler;

  // ---- direct access: for custom handlers ----
  /** Copies of every record. */
  all(): T[];
  /** A copy of the record, or `undefined`. */
  find(id: CollectionId): T | undefined;
  /** Store a record (id assigned if missing). Throws when the id exists. */
  insert(record: Partial<T>): T;
  /** Shallow-merge `changes` into the record; the id never changes. */
  patch(id: CollectionId, changes: Partial<T>): T | undefined;
  /** Remove the record; false for an unknown id. */
  delete(id: CollectionId): boolean;
}

/** Registry symbols, so copies of the package loaded side by side still agree. */
export const COLLECTION = Symbol.for('apitemkin.collection');
export const USAGE_ERROR = Symbol.for('apitemkin.usage-error');

export interface CollectionInternals {
  reset(): void;
  count(): number;
  /** The export name, set by the engine; used in messages. */
  name: string | undefined;
}

export function isCollection(v: unknown): v is Collection<object> {
  if (typeof v !== 'object' || v === null) return false;
  const internals = (v as Record<symbol, unknown>)[COLLECTION] as
    | Partial<CollectionInternals>
    | undefined;
  return typeof internals?.reset === 'function' && typeof internals.count === 'function';
}

export function internalsOf(c: Collection<object>): CollectionInternals {
  return (c as unknown as Record<symbol, CollectionInternals>)[COLLECTION]!;
}

function usageError(message: string): Error {
  return Object.assign(new Error(message), { [USAGE_ERROR]: true });
}

const isJsonObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Define an in-memory collection. Export it from the folder's `_data.ts` file
 * and use it from route files:
 *
 * ```ts
 * // users/_data.ts
 * export const users = defineCollection([{ id: 1, name: 'Ada' }]);
 *
 * // users/index.post.ts
 * import { users } from './_data';
 * export default users.create();
 * ```
 */
export function defineCollection<T extends object>(
  seed: T[],
  options: CollectionOptions<T> = {},
): Collection<T> {
  const idKey: string = options.idKey ?? 'id';
  const { newId, wrap } = options;
  type Row = Record<string, unknown>;

  const idOf = (r: T): unknown => (r as Row)[idKey];
  const sameId = (r: T, id: unknown): boolean => String(idOf(r)) === String(id);
  const clone = <V>(v: V): V => structuredClone(v);

  // The store keeps copies; a seed holding functions or class instances can't be copied.
  try {
    clone(seed);
  } catch (err) {
    throw new Error(
      `apitemkin: defineCollection seed must be plain data (objects, arrays, strings, numbers, booleans, null, Dates); ${(err as Error).message}`,
    );
  }

  // A seed record without an id could never be fetched, updated or removed; say so now.
  const seen = new Map<string, number>();
  seed.forEach((r, i) => {
    const id = idOf(r);
    if (id === undefined || id === null) {
      throw new Error(
        `apitemkin: defineCollection seed record ${i} has no "${idKey}". Give every seed record an ${idKey}, or set the idKey option.`,
      );
    }
    const first = seen.get(String(id));
    if (first !== undefined) {
      throw new Error(
        `apitemkin: defineCollection seed has duplicate ${idKey} ${String(id)} (records ${first} and ${i}).`,
      );
    }
    seen.set(String(id), i);
  });

  const numeric = seed.every((r) => typeof idOf(r) === 'number');
  const startCounter = seed.reduce((max, r) => {
    const id = idOf(r);
    return typeof id === 'number' && id > max ? id : max;
  }, 0);

  let records: T[] = clone(seed);
  let counter = startCounter;

  const internals: CollectionInternals = {
    reset() {
      records = clone(seed);
      counter = startCounter;
    },
    count: () => records.length,
    name: undefined,
  };

  const indexOf = (id: unknown): number => records.findIndex((r) => sameId(r, id));
  const label = (): string => (internals.name ? ` in ${internals.name}` : '');

  function assignId(): CollectionId {
    if (newId) return newId(clone(records));
    return numeric ? ++counter : randomUUID();
  }

  const conflictMessage = (id: unknown): string =>
    `A record with id ${String(id)} already exists${label()}`;

  /** Store a copy with the id first (assigned if missing). Reports a clash instead of throwing. */
  function tryInsert(record: Partial<T>): { stored: T } | { conflict: unknown } {
    const { [idKey]: given, ...rest } = clone(record) as Row;
    const id = given === undefined || given === null ? assignId() : given;
    if (indexOf(id) !== -1) return { conflict: id };
    if (typeof id === 'number' && id > counter) counter = id;
    const row = { [idKey]: id, ...rest } as T;
    records.push(row);
    return { stored: clone(row) };
  }

  function insert(record: Partial<T>): T {
    const result = tryInsert(record);
    if ('conflict' in result) throw new Error(`apitemkin: ${conflictMessage(result.conflict)}`);
    return result.stored;
  }

  function patch(id: CollectionId, changes: Partial<T>): T | undefined {
    const i = indexOf(id);
    if (i === -1) return undefined;
    const current = records[i]!;
    const next = { ...current, ...clone(changes), [idKey]: idOf(current) } as T;
    records[i] = next;
    return clone(next);
  }

  // ---- one-liner helpers ----
  const ok = (status: number, body: unknown): RichResponse => ({
    status,
    body: wrap ? wrap(body) : body,
  });
  const fail = (status: number, error: string): RichResponse => ({ status, body: { error } });
  const notFound = (id: string): RichResponse => fail(404, `No record with id ${id}${label()}`);
  const badBody = (): RichResponse => fail(400, 'Body must be a JSON object');

  function urlId(req: ApitemkinRequest, method: string): string {
    const values = Object.values(req.params);
    if (values.length === 0) {
      throw usageError(
        `apitemkin: ${internals.name ?? 'collection'}.${method}() needs a URL param, e.g. [id].ts`,
      );
    }
    return values[values.length - 1]!;
  }

  const collection: Collection<T> = {
    list: () => () => ok(200, clone(records)),

    get: () => (req) => {
      const id = urlId(req, 'get');
      const i = indexOf(id);
      return i === -1 ? notFound(id) : ok(200, clone(records[i]!));
    },

    create: () => (req) => {
      if (!isJsonObject(req.body)) return badBody();
      // Covers a body id in use and an assigned id that clashes (e.g. a custom newId).
      const result = tryInsert(req.body as Partial<T>);
      return 'conflict' in result ? fail(409, conflictMessage(result.conflict)) : ok(201, result.stored);
    },

    replace: () => (req) => {
      const id = urlId(req, 'replace');
      if (!isJsonObject(req.body)) return badBody();
      const i = indexOf(id);
      if (i === -1) return notFound(id);
      // The URL id wins over any id in the body, and goes first.
      const { [idKey]: _ignored, ...rest } = clone(req.body);
      const next = { [idKey]: idOf(records[i]!), ...rest } as T;
      records[i] = next;
      return ok(200, clone(next));
    },

    update: () => (req) => {
      const id = urlId(req, 'update');
      if (!isJsonObject(req.body)) return badBody();
      const next = patch(id, req.body as Partial<T>);
      return next === undefined ? notFound(id) : ok(200, next);
    },

    remove: () => (req) => {
      const id = urlId(req, 'remove');
      const i = indexOf(id);
      if (i === -1) return notFound(id);
      records.splice(i, 1);
      return { status: 204, body: '' };
    },

    all: () => clone(records),
    find: (id) => {
      const i = indexOf(id);
      return i === -1 ? undefined : clone(records[i]!);
    },
    insert,
    patch,
    delete: (id) => {
      const i = indexOf(id);
      if (i === -1) return false;
      records.splice(i, 1);
      return true;
    },
  };

  Object.defineProperty(collection, COLLECTION, { value: internals, enumerable: false });
  return collection;
}
