package com.github.lonelylockley.archinsight.screens;

import com.github.lonelylockley.archinsight.components.NotificationComponent;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;
import com.vaadin.flow.server.auth.AnonymousAllowed;

@Route(value = "playground")
@PageTitle("Archinsight")
@AnonymousAllowed
@JsModule("@vaadin/vaadin-lumo-styles/presets/compact.js")
public class PlaygroundView extends BasicEditorView {
    public PlaygroundView() {
        Authentication.enablePlaygroundMode();
        initView("playground", true, 47);
        new NotificationComponent("""
                <div>
                Breaking changes in the Insight language are planned for version 2.0.
                You may read what's going to change and why in the <a target="_blank" href="https://medium.com/@lonelylockley/archinsight-the-evolution-from-architectural-diagrams-to-true-modeling-9bd70b6efae2">article on medium.com</a>.
                </div>
                """, MessageLevel.WARNING);
    }
}
