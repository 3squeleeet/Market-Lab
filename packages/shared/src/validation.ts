/** Reject values that would silently change when persisted or sent through JSON/STDIO. */
export function assertJSON(
  value: unknown,
  path = "$",
  ancestors = new Set<object>(),
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw Error(`Número não finito em ${path}`);
    return;
  }
  if (typeof value !== "object")
    throw Error(`Valor não serializável em ${path}`);
  if (ancestors.has(value)) throw Error(`Referência circular em ${path}`);
  ancestors.add(value);
  for (const [key, item] of Object.entries(value))
    assertJSON(item, `${path}.${key}`, ancestors);
  ancestors.delete(value);
}
