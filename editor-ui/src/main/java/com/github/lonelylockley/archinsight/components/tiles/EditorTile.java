package com.github.lonelylockley.archinsight.components.tiles;

import com.github.lonelylockley.archinsight.events.BaseListener;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.UserAuthenticatedEvent;
import com.github.lonelylockley.archinsight.screens.EditorView;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.UI;

public class EditorTile extends SiteViewTile {

    public EditorTile() {
        super("Open Insight editor", "static/archinsight-logo-no-background.svg", "#59981A", doubleWidth, singleHeight);
        setClassName("tile_action");
        addClickListener(e -> {
            UI.getCurrent().navigate(EditorView.class);
        });
        Communication.getBus().register(this,
                new BaseListener<UserAuthenticatedEvent>() {
                    @Override
                    @Subscribe
                    public void receive(UserAuthenticatedEvent e) {
                        e.getUIContext().access(() -> {
                            setVisible(true);
                        });
                    }
                });

        if (Authentication.authenticated()) {
            setVisible(true);
        }
        else {
            setVisible(false);
        }
        makeTextBold();
    }

}
