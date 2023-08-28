package com.github.lonelylockley.archinsight.screens;

import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;

@Route("playground")
@PageTitle("Archinsight")
public class PlaygroundView extends BasicEditorView {
    public PlaygroundView() {
        super(" Playground", false);
    }
}
