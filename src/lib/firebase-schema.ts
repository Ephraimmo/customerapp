import { useMemo } from "react";
import { useFirebaseValue, type FirebaseRecord, type FirebaseValue } from "./firebase-live";

export type FieldSchema = {
  name: string;
  types: string[];
  optional: boolean;
  isTimestamp: boolean;
  isReference: boolean;
  children?: FieldSchema[] | undefined;
};

export type NodeSchema = {
  path: string;
  shape: "collection" | "object" | "primitive";
  count: number;
  fields: FieldSchema[];
};

const TIMESTAMP_HINT = /(at|time|timestamp|date)$/i;
const REFERENCE_HINT = /(id|ids|ref|uid|slug)$/i;

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isRecord(value: unknown): value is FirebaseRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** True when a node looks like a keyed collection of similar objects. */
function looksLikeCollection(value: FirebaseRecord): boolean {
  const entries = Object.values(value);
  if (entries.length === 0) return false;
  const objects = entries.filter(isRecord);
  return objects.length / entries.length >= 0.6;
}

function inferFields(samples: FirebaseRecord[], depth: number): FieldSchema[] {
  const keys = new Set<string>();
  samples.forEach((s) => Object.keys(s).forEach((k) => keys.add(k)));

  return Array.from(keys).map((name) => {
    const present = samples.filter((s) => name in s);
    const values = present.map((s) => s[name]);
    const types = Array.from(new Set(values.map(typeOf)));
    const nested = values.filter(isRecord);

    return {
      name,
      types,
      optional: present.length < samples.length || types.includes("null"),
      isTimestamp:
        TIMESTAMP_HINT.test(name) &&
        values.some((v) => typeof v === "number" || typeof v === "string"),
      isReference: REFERENCE_HINT.test(name) && values.some((v) => typeof v === "string"),
      children: depth > 0 && nested.length ? inferFields(nested, depth - 1) : undefined,
    };
  });
}

/** Infers a schema for every top-level node found in the database. */
export function discoverSchemas(root: FirebaseValue, sampleSize = 12): NodeSchema[] {
  if (!isRecord(root)) return [];

  return Object.entries(root).map(([path, node]) => {
    if (!isRecord(node)) {
      return { path, shape: "primitive", count: 1, fields: [] } as NodeSchema;
    }
    if (looksLikeCollection(node)) {
      const samples = Object.values(node).filter(isRecord).slice(0, sampleSize);
      return {
        path,
        shape: "collection",
        count: Object.keys(node).length,
        fields: inferFields(samples, 2),
      };
    }
    return {
      path,
      shape: "object",
      count: Object.keys(node).length,
      fields: inferFields([node], 2),
    };
  });
}

function tsType(field: FieldSchema): string {
  const mapped = field.types
    .filter((t) => t !== "null")
    .map((t) => {
      if (t === "array") return "unknown[]";
      if (t === "object") {
        return field.children?.length
          ? `{ ${field.children.map((c) => `${c.name}${c.optional ? "?" : ""}: ${tsType(c)}`).join("; ")} }`
          : "Record<string, unknown>";
      }
      if (t === "string" || t === "number" || t === "boolean") return t;
      return "unknown";
    });
  const union = Array.from(new Set(mapped));
  if (!union.length) return "unknown";
  return field.types.includes("null") ? `${union.join(" | ")} | null` : union.join(" | ");
}

function pascal(path: string) {
  return path
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join("");
}

/** Generates readable TypeScript models from discovered schemas (dev tooling / debugging). */
export function generateTypeScript(schemas: NodeSchema[]): string {
  return schemas
    .filter((s) => s.fields.length)
    .map((s) => {
      const body = s.fields
        .map((f) => `  ${f.name}${f.optional ? "?" : ""}: ${tsType(f)};`)
        .join("\n");
      const alias =
        s.shape === "collection"
          ? `\nexport type ${pascal(s.path)}Map = Record<string, ${pascal(s.path)}>;`
          : "";
      return `export interface ${pascal(s.path)} {\n${body}\n}${alias}`;
    })
    .join("\n\n");
}

const SCHEMA_KEY = "hearth.fb.schema.e-comm-bd997.v1";

/** Subscribes to the whole database and keeps a discovered schema cached. */
export function useDatabaseSchema() {
  const root = useFirebaseValue<FirebaseValue>("/");

  const schemas = useMemo(() => {
    const discovered = discoverSchemas(root.data);
    if (discovered.length && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(SCHEMA_KEY, JSON.stringify(discovered));
      } catch {
        /* best effort */
      }
    }
    return discovered;
  }, [root.data]);

  return { ...root, schemas, nodes: schemas.map((s) => s.path) };
}

export function readCachedSchemas(): NodeSchema[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SCHEMA_KEY);
    return raw ? (JSON.parse(raw) as NodeSchema[]) : [];
  } catch {
    return [];
  }
}
