package com.github.lonelylockley.archinsight.components.tiles;

public class GithubTile extends SiteViewTile {
    public GithubTile() {
        super("Project Github", "static/github-142-svgrepo-com.svg", "#171515", singleWidth, singleHeight);
        getElement().setAttribute("router-ignore", true);
        setClassName("tile_action");
        addClickListener(e -> {
            getElement().executeJs("window.open('https://github.com/lonely-lockley/archinsight', '_blank')");
        });
    }
}
