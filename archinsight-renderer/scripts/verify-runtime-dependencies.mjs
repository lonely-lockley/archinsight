import { inlineGraphvizIcons } from '@archinsight/graphviz';

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
