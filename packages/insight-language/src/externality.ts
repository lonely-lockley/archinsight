import type { LinkedElement } from "./contracts.js";
import { TYPE_CAPABILITIES } from "./semantic-capabilities.js";
import type { TypeSystem } from "./type-system.js";

export const EXTERNAL_ELEMENT_KIND = "external";

export function linkedElementIsExplicitlyExternal(element: LinkedElement): boolean {
  return element.capabilities?.includes(TYPE_CAPABILITIES.externalElement) === true
    || element.attributes.kind?.includes(EXTERNAL_ELEMENT_KIND) === true;
}

export function elementTypeOrKindIsExplicitlyExternal(
  type: string,
  kind: string | undefined,
  typeSystem: TypeSystem,
): boolean {
  return typeSystem.typeHasCapability(type, TYPE_CAPABILITIES.externalElement)
    || kind === EXTERNAL_ELEMENT_KIND;
}
