package com.github.lonelylockley.archinsight.components.tiles;

import com.github.lonelylockley.archinsight.events.BaseListener;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.UserAuthenticatedEvent;
import com.github.lonelylockley.archinsight.screens.EditorView;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.UI;

public class ArchinsightTile extends SiteViewTile {

    public ArchinsightTile() {
        super("Open Insight editor", "static/archinsight-logo-no-background.svg", "#04AA6D", doubleWidth, singleHeight);
        setClassName("tile_action");
        addClickListener(e -> {
            UI.getCurrent().navigate(EditorView.class);
        });
        var authListener = new BaseListener<UserAuthenticatedEvent>() {
            @Override
            @Subscribe
            public void receive(UserAuthenticatedEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    setVisible(true);
                }
            }
        };
        Communication.getBus().register(authListener);
        addDetachListener(e -> Communication.getBus().unregister(authListener));
        if (Authentication.authenticated()) {
            setVisible(true);
        }
        else {
            setVisible(false);
        }
        makeTextBold();
    }

}
