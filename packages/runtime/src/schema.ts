import { toJsonSchema } from '@valibot/to-json-schema';
import * as v from 'valibot';
import type { ValidationIssue } from './errors.ts';

type ReadonlyJsonValue =
	| null
	| boolean
	| number
	| string
	| readonly ReadonlyJsonValue[]
	| { readonly [key: string]: ReadonlyJsonValue };
export type ReadonlyJsonSchema = Readonly<Record<string, ReadonlyJsonValue>>;

const jsonSchemas = new WeakMap<object, ReadonlyJsonSchema>();

function isStandardSchema(value: unknown): value is object & { '~standard': object } {
	if (!value || typeof value !== 'object') return false;
	const marker = (value as { '~standard'?: unknown })['~standard'];
	return typeof marker === 'object' && marker !== null;
}

export function isValibotSchema(value: unknown): value is v.GenericSchema {
	if (!isStandardSchema(value)) return false;
	const schema = value as {
		kind?: unknown;
		type?: unknown;
		async?: unknown;
		'~run'?: unknown;
		'~standard': { version?: unknown; vendor?: unknown; validate?: unknown };
	};
	return (
		schema.kind === 'schema' &&
		typeof schema.type === 'string' &&
		typeof schema.async === 'boolean' &&
		typeof schema['~run'] === 'function' &&
		schema['~standard'].version === 1 &&
		schema['~standard'].vendor === 'valibot' &&
		typeof schema['~standard'].validate === 'function'
	);
}

export function isTopLevelObjectSchema(schema: v.GenericSchema): boolean {
	const type = (schema as { type?: string }).type;
	return ['object', 'strict_object', 'loose_object', 'object_with_rest'].includes(type ?? '');
}

export function valibotToJsonSchema(schema: v.GenericSchema): ReadonlyJsonSchema {
	assertValibotSchema(schema);
	const cached = jsonSchemas.get(schema);
	if (cached) return cached;
	const { $schema: _schema, ...jsonSchema } = toJsonSchema(schema, {
		errorMode: 'ignore',
	}) as { $schema?: unknown } & Record<string, ReadonlyJsonValue>;
	const frozen = deepFreeze(jsonSchema);
	jsonSchemas.set(schema, frozen);
	return frozen;
}

function deepFreeze<T extends ReadonlyJsonValue>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		for (const nested of Object.values(value)) deepFreeze(nested);
		Object.freeze(value);
	}
	return value;
}

export function parseValibot<S extends v.GenericSchema>(
	schema: S,
	value: unknown,
): { success: true; output: v.InferOutput<S> } | { success: false; issues: ValidationIssue[] } {
	assertValibotSchema(schema);
	const parsed = v.safeParse(schema, value);
	if (parsed.success) return { success: true, output: parsed.output };
	return { success: false, issues: parsed.issues.map(normalizeValibotIssue) };
}

function assertValibotSchema(value: unknown): asserts value is v.GenericSchema {
	if (!isValibotSchema(value)) throw new TypeError('[bapX] Expected a Valibot schema.');
}

function normalizeValibotIssue(issue: v.BaseIssue<unknown>): ValidationIssue {
	const path = issue.path
		?.map((segment) => segment.key)
		.filter((key): key is PropertyKey => key !== undefined && key !== null);
	return path && path.length > 0 ? { message: issue.message, path } : { message: issue.message };
}
