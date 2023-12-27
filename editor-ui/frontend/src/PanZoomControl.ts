const _global = (window) as any
const step: number = 0.1;

function zoomIn(id: string) {
    var svg = document.getElementById(id)! as any;
    if (!svg._calculatedWidth || !svg._calculatedHeight) {
        getBasics(svg);
    }
    svg._calculatedWidth = svg._calculatedWidth + svg._calculatedWidth * step;
    svg._calculatedHeight = svg._calculatedHeight + svg._calculatedHeight * step;
    svg.style.width = svg._calculatedWidth + 'pt';
    svg.style.height = svg._calculatedHeight + 'pt';
}

function zoomOut(id: string) {
    var svg = document.getElementById(id)! as any;
    if (!svg._calculatedWidth || !svg._calculatedHeight) {
        getBasics(svg);
    }
    svg._calculatedWidth = svg._calculatedWidth - svg._calculatedWidth * step;
    svg._calculatedHeight = svg._calculatedHeight - svg._calculatedHeight * step;
    svg.style.width = svg._calculatedWidth + 'pt';
    svg.style.height = svg._calculatedHeight + 'pt';
}

function zoomReset(id: string) {
    var svg = document.getElementById(id)! as any;
    getBasics(svg);
    svg.style.width = svg._calculatedWidth + 'pt';
    svg.style.height = svg._calculatedHeight + 'pt';
}

function zoomFit(id: string, suggestedWidth: number) {
    var svg = document.getElementById(id)! as any;
    if (!svg._calculatedWidth || !svg._calculatedHeight) {
        getBasics(svg);
    }
    var scale = suggestedWidth / svg._calculatedWidth * 0.78;
    svg._calculatedWidth = svg._calculatedWidth * scale;
    svg._calculatedHeight = svg._calculatedHeight * scale;
    svg.style.width = svg._calculatedWidth + 'pt';
    svg.style.height = svg._calculatedHeight + 'pt';
}

function zoomRestore(id: string) {
    var svg = document.getElementById(id)! as any;
    svg.style.width = svg._calculatedWidth + 'pt';
    svg.style.height = svg._calculatedHeight + 'pt';
}

function getBasics(svg: any) {
    svg._calculatedWidth = svg.width.baseVal.valueInSpecifiedUnits;
    svg._calculatedHeight = svg.height.baseVal.valueInSpecifiedUnits;
}

_global.zoomIn = zoomIn;
_global.zoomOut = zoomOut;
_global.zoomReset = zoomReset;
_global.zoomFit = zoomFit;
_global.zoomRestore = zoomRestore;
