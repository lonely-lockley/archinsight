export class ContractValidationError extends Error {
  readonly name = 'ContractValidationError';
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContractValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function string(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new ContractValidationError(`${label} must be a string`);
  }
  return value;
}

export function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ContractValidationError(`${label} must be a finite number`);
  }
  return value;
}

export function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ContractValidationError(`${label} must be a boolean`);
  }
  return value;
}

export function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ContractValidationError(`${label} must be an array`);
  }
  return value;
}

export function nullableString(value: unknown, label: string): string | null | undefined {
  return value == null ? value : string(value, label);
}

export function optionalStringRecord(value: unknown, label: string): Record<string, string> | null | undefined {
  if (value == null) return value;
  const input = record(value, label);
  return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, string(item, `${label}.${key}`)]));
}

export function stringArray(value: unknown, label: string): string[] {
  return array(value, label).map((item, index) => string(item, `${label}[${index}]`));
}
