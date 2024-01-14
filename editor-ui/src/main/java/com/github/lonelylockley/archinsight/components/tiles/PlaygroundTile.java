package com.github.lonelylockley.archinsight.components.tiles;

import com.github.lonelylockley.archinsight.screens.PlaygroundView;
import com.vaadin.flow.component.UI;

public class PlaygroundTile extends SiteViewTile {
    public PlaygroundTile() {
        super("Try it!", "static/playground-svgrepo-com.svg", "#59981A", singleWidth, singleHeight);
        setClassName("tile_action");
        addClickListener(e -> {
            UI.getCurrent().navigate(PlaygroundView.class);
        });
        makeTextBold();
    }
}
