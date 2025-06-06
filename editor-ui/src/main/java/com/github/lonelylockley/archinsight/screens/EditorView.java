package com.github.lonelylockley.archinsight.screens;

import com.github.lonelylockley.archinsight.security.Authentication;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;
import jakarta.annotation.security.RolesAllowed;

@Route("editor")
@PageTitle("Archinsight Editor")
@RolesAllowed("user")
@JsModule("@vaadin/vaadin-lumo-styles/presets/compact.js")
public class EditorView extends BasicEditorView {
    public EditorView() {
        Authentication.disablePlaygroundMode();
        initView(null, false, 137);
    }
}
