package com.github.lonelylockley.archinsight.screens;

import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;
import com.vaadin.flow.server.auth.AnonymousAllowed;

@Route("playground")
@PageTitle("Archinsight")
@AnonymousAllowed
public class PlaygroundView extends BasicEditorView {
    public PlaygroundView() {
        super(" Playground", false);
    }
}
