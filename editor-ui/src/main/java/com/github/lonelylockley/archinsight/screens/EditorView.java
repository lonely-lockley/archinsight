package com.github.lonelylockley.archinsight.screens;

import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;
import jakarta.annotation.security.RolesAllowed;

@Route("editor")
@PageTitle("Archinsight")
@RolesAllowed("user")
public class EditorView extends BasicEditorView {
    public EditorView() {
        super(null, true);

    }
}
