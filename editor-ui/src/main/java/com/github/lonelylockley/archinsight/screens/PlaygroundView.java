package com.github.lonelylockley.archinsight.screens;

import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;
import com.vaadin.flow.server.auth.AnonymousAllowed;

@Route("playground")
@PageTitle("Archinsight")
@AnonymousAllowed
@JsModule("@vaadin/vaadin-lumo-styles/presets/compact.js")
public class PlaygroundView extends BasicEditorView {
    public PlaygroundView() {
        super(" Playground");
    }
}
