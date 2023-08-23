const _global = (window) as any
const step: number = 0.1;
var width: number;
var height: number;

function zoomIn() {
    var svg = document.getElementById('svg_render')!;
    if (!width || !height) {
        getBasics(svg);
    }
    width = width + width * step;
    height = height + height * step;
    svg.style.width = width + 'pt';
    svg.style.height = height + 'pt';
}

function zoomOut() {
    var svg = document.getElementById('svg_render')!;
    if (!width || !height) {
        getBasics(svg);
    }
    width = width - width * step;
    height = height - height * step;
    svg.style.width = width + 'pt';
    svg.style.height = height + 'pt';
}

function reset() {
    var svg = document.getElementById('svg_render')!;
    getBasics(svg);
    svg.style.width = width + 'pt';
    svg.style.height = height + 'pt';
}

function getBasics(svg: any) {
    width = svg.width.baseVal.valueInSpecifiedUnits;
    height = svg.height.baseVal.valueInSpecifiedUnits;
}

_global.zoomIn = zoomIn;
_global.zoomOut = zoomOut;
_global.reset = reset;