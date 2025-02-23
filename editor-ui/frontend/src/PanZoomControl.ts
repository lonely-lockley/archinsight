const _global = (window) as any
const step: number = 0.1;

function zoomIn(id: string) {
    const div = document.getElementById(id)! as any;
    const svg = div.querySelector('svg');
    if (svg === undefined || svg == null) {
        return;
    }
    if (!svg._calculatedWidth || !svg._calculatedHeight) {
        getBasics(svg);
    }
    svg._calculatedWidth = svg._calculatedWidth + svg._calculatedWidth * step;
    svg._calculatedHeight = svg._calculatedHeight + svg._calculatedHeight * step;
    svg.style.width = svg._calculatedWidth + 'pt';
    svg.style.height = svg._calculatedHeight + 'pt';
    div._calculatedWidth = svg._calculatedWidth;
    div._calculatedHeight = svg._calculatedHeight;
}

function zoomOut(id: string) {
    const div = document.getElementById(id)! as any;
    const svg = div.querySelector('svg');
    if (svg === undefined || svg == null) {
        return;
    }
    if (!svg._calculatedWidth || !svg._calculatedHeight) {
        getBasics(svg);
    }
    svg._calculatedWidth = svg._calculatedWidth - svg._calculatedWidth * step;
    svg._calculatedHeight = svg._calculatedHeight - svg._calculatedHeight * step;
    svg.style.width = svg._calculatedWidth + 'pt';
    svg.style.height = svg._calculatedHeight + 'pt';
    div._calculatedWidth = svg._calculatedWidth;
    div._calculatedHeight = svg._calculatedHeight;
}

function zoomReset(id: string) {
    const div = document.getElementById(id)! as any;
    const svg = div.querySelector('svg');
    if (svg === undefined || svg == null) {
        return;
    }
    getBasics(svg);
    svg.style.width = svg._calculatedWidth + 'pt';
    svg.style.height = svg._calculatedHeight + 'pt';
    delete div._calculatedWidth;
    delete div._calculatedHeight;
}

function zoomFit(id: string, suggestedWidth: number) {
    const div = document.getElementById(id)! as any;
    const svg = div.querySelector('svg');
    if (svg === undefined || svg == null) {
        return;
    }
    if (!svg._calculatedWidth || !svg._calculatedHeight) {
        getBasics(svg);
    }
    const scale = suggestedWidth / svg._calculatedWidth * 0.78;
    svg._calculatedWidth = svg._calculatedWidth * scale;
    svg._calculatedHeight = svg._calculatedHeight * scale;
    svg.style.width = svg._calculatedWidth + 'pt';
    svg.style.height = svg._calculatedHeight + 'pt';
    div._calculatedWidth = svg._calculatedWidth;
    div._calculatedHeight = svg._calculatedHeight;
}

function zoomRestore(id: string) {
    const div = document.getElementById(id)! as any;
    const svg = div.querySelector('svg');
    if (svg === undefined || svg == null) {
        return;
    }
    svg.style.width = div._calculatedWidth + 'pt';
    svg.style.height = div._calculatedHeight + 'pt';
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
