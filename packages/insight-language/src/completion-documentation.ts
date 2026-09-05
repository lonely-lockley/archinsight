import type {
  CompletionDocumentation,
  LinkedElement,
  ResolvedPresentation,
} from "./contracts.js";
import { presentationText, type PresentationTextField } from "./presentation-resolver.js";

export function elementCompletionDocumentation(
  element: LinkedElement,
  presentations: Readonly<Record<string, ResolvedPresentation>>,
): CompletionDocumentation | undefined {
  const presentation = presentations[element.type];
  if (presentation === undefined) {
    return undefined;
  }
  const documentation: CompletionDocumentation = {
    ...presentationField("header", presentation, element),
    ...presentationField("subtitle", presentation, element),
    ...presentationField("body", presentation, element),
  };
  return Object.keys(documentation).length === 0 ? undefined : documentation;
}

function presentationField(
  field: PresentationTextField,
  presentation: ResolvedPresentation,
  element: LinkedElement,
): Partial<CompletionDocumentation> {
  const value = presentationText(presentation, field, element.attributes);
  return value === undefined ? {} : { [field]: value };
}
