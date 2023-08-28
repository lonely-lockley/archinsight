package com.github.lonelylockley.archinsight.screens;

import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;

@Route("editor")
@PageTitle("Archinsight")
public class EditorView extends BasicEditorView {
    public EditorView() {
        super(null, true);

    }
}
