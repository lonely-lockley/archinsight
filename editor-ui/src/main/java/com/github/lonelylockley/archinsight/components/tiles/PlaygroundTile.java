package com.github.lonelylockley.archinsight.components.tiles;

import com.github.lonelylockley.archinsight.screens.PlaygroundView;
import com.vaadin.flow.component.UI;

public class PlaygroundTile extends SiteViewTile {
    public PlaygroundTile() {
        super("Playground", "static/playground-svgrepo-com.svg", "#04AA6D", singleWidth, singleHeight);
        setClassName("tile_action");
        addClickListener(e -> {
            UI.getCurrent().navigate(PlaygroundView.class);
        });
    }
}
