const _global = (window) as any
const step: number = 0.1;
var width: number;
var height: number;

function zoomIn() {
    console.log('zoomIn');
    var svg = document.getElementById('svg_render')!;
    if (!width || !height) {
        getBasics(svg);
    }
    console.log('dw = ' + width * step);
    console.log('dh = ' + height * step);
    width = width + width * step;
    height = height + height * step;
    console.log('curw = ' + width);
    console.log('curh = ' + height);
    svg.style.width = width + 'pt';
    svg.style.height = height + 'pt';
}

function zoomOut() {
    console.log('zoomOut');
    var svg = document.getElementById('svg_render')!;
    if (!width || !height) {
        getBasics(svg);
    }
    console.log('dw = ' + width * step);
    console.log('dh = ' + height * step);
    width = width - width * step;
    height = height - height * step;
    console.log('curw = ' + width);
    console.log('curh = ' + height);
    svg.style.width = width + 'pt';
    svg.style.height = height + 'pt';
}

function reset() {
    console.log('reset');
    var svg = document.getElementById('svg_render')!;
    getBasics(svg);
    svg.style.width = width + 'pt';
    svg.style.height = height + 'pt';
}

function getBasics(svg: any) {
    width = svg.width.baseVal.valueInSpecifiedUnits;
    height = svg.height.baseVal.valueInSpecifiedUnits;
    console.log('basicw = ' + width);
    console.log('basich = ' + height);
}

_global.zoomIn = zoomIn;
_global.zoomOut = zoomOut;
_global.reset = reset;