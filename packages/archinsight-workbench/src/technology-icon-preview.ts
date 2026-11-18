import { loadTechnologyIconSvg } from '@archinsight/icons';

export function technologyIconDataUri(svg: string, color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg.replaceAll('currentColor', color))}`;
}

/** Lazily builds documentation for the completion item currently resolved by an editor. */
export async function technologyIconCompletionMarkdown(
  iconId: string,
  existingDocumentation?: string,
): Promise<string | undefined> {
  const svg = await loadTechnologyIconSvg(iconId);
  if (svg === undefined) return existingDocumentation;
  const preview = `![${iconId} icon](${technologyIconDataUri(svg, '#6ea8fe')})`;
  return existingDocumentation === undefined ? `${preview}\n\n\`${iconId}\`` : `${preview}\n\n${existingDocumentation}`;
}
