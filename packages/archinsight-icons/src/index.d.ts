export type TechnologyIconId = string;

export interface TechnologyIconEntry {
  readonly id: TechnologyIconId;
  readonly label: string;
  readonly variant: 'plain' | 'line' | 'original';
}

export interface TechnologyIconMatch extends TechnologyIconEntry {
  readonly matchedBy: 'id' | 'alternate-name' | 'alias';
}

export type ExplicitIconResolution =
  | { readonly status: 'resolved'; readonly id: TechnologyIconId }
  | { readonly status: 'disabled' }
  | { readonly status: 'unknown'; readonly suggestions: readonly TechnologyIconId[] };

export declare function resolveExplicitIcon(value: string): ExplicitIconResolution;
export declare function resolveTechnologyIcon(values: readonly string[]): TechnologyIconMatch | undefined;
export declare function searchTechnologyIcons(query: string, limit?: number): readonly TechnologyIconEntry[];
export declare function technologyIcon(id: string): TechnologyIconEntry | undefined;
export declare function technologyIconCatalog(): readonly TechnologyIconEntry[];
export declare function loadTechnologyIconSvg(id: string): Promise<string | undefined>;
export declare function normalizeTechnology(value: string): string;
