package com.github.lonelylockley.archinsight.components.tiles;

public class MailtoTile extends SiteViewTile {

    public MailtoTile() {
        super("Contact us", "static/mail-pencil-svgrepo-com.svg", "#f9d423", singleWidth, singleHeight);
        getElement().setAttribute("router-ignore", true);
        setClassName("tile_action");
        addClickListener(e -> {
            getElement().executeJs("window.open('mailto:webmaster@archinsight.org', '')");
        });
    }
}
