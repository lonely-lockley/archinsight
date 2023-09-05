package com.github.lonelylockley.archinsight.components.tiles;

public class InsightLanguageTile extends SiteViewTile {
    public InsightLanguageTile() {
        super("Insight language", "static/language-json-svgrepo-com.svg", "#a7226e", singleWidth, singleHeight);
        getElement().setAttribute("router-ignore", true);
        setClassName("tile_action");
        addClickListener(e -> {
            getElement().executeJs("window.open('https://github.com/lonely-lockley/archinsight/wiki/Insight-language', '_blank')");
        });
    }
}
