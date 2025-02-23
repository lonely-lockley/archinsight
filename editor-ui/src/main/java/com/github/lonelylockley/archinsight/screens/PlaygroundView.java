package com.github.lonelylockley.archinsight.screens;

import com.github.lonelylockley.archinsight.security.Authentication;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;
import com.vaadin.flow.server.auth.AnonymousAllowed;

@Route(value = "playground")
@PageTitle("Archinsight Playground")
@AnonymousAllowed
@JsModule("@vaadin/vaadin-lumo-styles/presets/compact.js")
public class PlaygroundView extends BasicEditorView {
    public PlaygroundView() {
        Authentication.enablePlaygroundMode();
        initView("playground", true, 47);
    }
}
