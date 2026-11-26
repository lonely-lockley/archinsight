export function stylePngText(svg: string): string;
export function embedPngFonts(svg: string, loadFont: (file: "Carlito-Regular" | "Carlito-Bold" | "Carlito-Italic" | "Carlito-BoldItalic" | "NotoColorEmoji") => Promise<string>): Promise<string>;
