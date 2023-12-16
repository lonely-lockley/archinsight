package com.github.lonelylockley.archinsight.components.tiles;

public class DevModeLocalLoginTile extends SiteViewTile {

    public DevModeLocalLoginTile(String loginUrl) {
        super("Test Login", "static/user-check-svgrepo-com.svg", "#ffffff", doubleWidth, singleHeight);
        getElement().getStyle().set("color", "#000000");
        addClickListener(e -> {
            getElement().executeJs(String.format("window.open('%s/auth/testOk', '')", loginUrl));
        });
        setClassName("tile_action");
    }
}
