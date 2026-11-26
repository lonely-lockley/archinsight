import { realpathSync } from 'node:fs';

export function pngFonts() {
  const faces = ['Carlito-Regular', 'Carlito-Bold', 'Carlito-Italic', 'Carlito-BoldItalic', 'NotoColorEmoji'];
  return faces.map(face => realpathSync(new URL(`./fonts/${face}.ttf`, import.meta.url)));
}
