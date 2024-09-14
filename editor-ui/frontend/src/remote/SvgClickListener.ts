function onClick(event: MouseEvent, container: HTMLElement) {
    if (event.altKey && event.button === 0) {
        let tgt = event.target! as HTMLElement;
        while (tgt != undefined && tgt.parentElement!.getAttribute('id') != "graph0") {
            tgt = tgt.parentElement!;
        }
        (container.parentElement as any).$server.elementSelected(tgt.id);
    }
}

(window as any).svgClickListener = onClick
