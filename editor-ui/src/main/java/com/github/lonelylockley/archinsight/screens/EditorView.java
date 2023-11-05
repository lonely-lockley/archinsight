package com.github.lonelylockley.archinsight.screens;

import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;

import javax.annotation.security.RolesAllowed;

@Route("editor")
@PageTitle("Archinsight")
@RolesAllowed("user")
@JsModule("@vaadin/vaadin-lumo-styles/presets/compact.js")
public class EditorView extends BasicEditorView {
    public EditorView() {
        super(null);
    }
}
