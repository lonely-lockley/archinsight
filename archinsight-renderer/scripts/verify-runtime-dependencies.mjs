import { inlineGraphvizIcons } from '@archinsight/graphviz';

import { pngFonts } from '@archinsight/graphviz/png-fonts';
import { renderRaw } from 'resvg-napi/helpers';
import { stylePngText } from '@archinsight/graphviz/png-text';

const label = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="30"><text x="2" y="20">👩‍💻 Заказы</text></svg>';
if (!renderRaw(stylePngText(label), { fonts: pngFonts() }).data.some((red, i, rgba) => i % 4 === 0 && red > rgba[i + 2] + 40)) {
  throw new Error('Renderer runtime cannot paint PNG labels');
}

const slotId = 'runtime-dependency-check';
const source = `<svg><g><a href="#${slotId}"><polygon points="0,0 40,0 40,40 0,40"/></a></g></svg>`;
const rendered = await inlineGraphvizIcons(source, [{
  slotId,
  iconId: 'postgresql',
  color: '#f4f4f4'
}]);

if (!rendered.includes('class="technology-icon"') || rendered.includes(`href="#${slotId}"`)) {
  throw new Error('Renderer runtime cannot resolve and inline technology icons');
}
