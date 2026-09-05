export function makeGraphvizBackgroundsTransparent(svg: string): string {
  return svg.replace(/<g\b[^>]*\bclass="(graph|cluster)"[^>]*>[\s\S]*?<polygon\b[^>]*>/g, (match, groupClass: string) => {
    const polygonStart = match.lastIndexOf("<polygon");
    const beforePolygon = match.slice(0, polygonStart);
    const polygon = match.slice(polygonStart);
    const transparentPolygon = groupClass === "graph"
      ? setSvgAttribute(setSvgAttribute(polygon, "fill", "transparent"), "stroke", "transparent")
      : setSvgAttribute(polygon, "fill", "transparent");
    return `${beforePolygon}${transparentPolygon}`;
  });
}

function setSvgAttribute(tag: string, name: string, value: string): string {
  const attribute = new RegExp(`\\s${name}=(["']).*?\\1`);
  if (attribute.test(tag)) {
    return tag.replace(attribute, ` ${name}="${value}"`);
  }
  return tag.replace(/\/?>$/, (end) => ` ${name}="${value}"${end}`);
}
