package com.github.lonelylockley.archinsight.components.tiles;

public class DockerhubTile extends SiteViewTile {
    public DockerhubTile() {
        super("Dockerhub", "static/docker-svgrepo-com.svg", "#0db7ed", singleWidth, singleHeight);
        getElement().setAttribute("router-ignore", true);
        setClassName("tile_action");
        addClickListener(e -> {
            getElement().executeJs("window.open('https://hub.docker.com/r/lonelylockley/archinsight', '_blank')");
        });
    }
}
