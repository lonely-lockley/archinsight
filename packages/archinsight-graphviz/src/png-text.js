// Graphviz emits each formatted label run as a separate SVG text element.
export function stylePngText(svg) {
  return svg.replace(/<text\b([^>]*)>([^<]*)<\/text>/gu, (_, attributes, text) => {
    const layout = attributes.replace(/\sfont-family=(?:"[^"]*"|'[^']*')/gu, '');
    const runs = text.replace(/\p{RGI_Emoji}(?!\uFE0E)/gv, emoji =>
      `<tspan font-family="Noto Color Emoji" font-style="normal" font-weight="normal">${emoji}</tspan>`
    );
    return `<text${layout} font-family="Carlito">${runs}</text>`;
  });
}

export async function embedPngFonts(svg, loadFont) {
  if (!/<text\b/u.test(svg)) return svg;
  const styled = stylePngText(svg);
  const faces = [
    ['Carlito-Regular', 'Carlito', 'normal', '400'],
    ['Carlito-Bold', 'Carlito', 'normal', '700'],
    ['Carlito-Italic', 'Carlito', 'italic', '400'],
    ['Carlito-BoldItalic', 'Carlito', 'italic', '700']
  ];
  if (styled.includes('font-family="Noto Color Emoji"')) {
    faces.push(['NotoColorEmoji', 'Noto Color Emoji', 'normal', '400']);
  }
  const rules = await Promise.all(faces.map(async ([file, family, style, weight]) =>
    `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};src:url("${await loadFont(file)}") format("woff2")}`
  ));
  return styled.replace(/<svg\b[^>]*>/u, root => `${root}<defs><style>${rules.join('')}</style></defs>`);
}
