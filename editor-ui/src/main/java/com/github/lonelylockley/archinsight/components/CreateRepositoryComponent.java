package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.events.*;
import com.vaadin.flow.component.Unit;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.html.Image;

public class CreateRepositoryComponent extends Button {

    public CreateRepositoryComponent() {
        super("Create own repository");
        final var conf = MicronautContext.getInstance().getConf();
        addThemeVariants(ButtonVariant.LUMO_PRIMARY);
        setId("menu_btn_create_acc");
        setWidthFull();
        final var icon = new Image("static/google-178-svgrepo-com.svg", "G");
        icon.setHeight(20, Unit.PIXELS);
        icon.setWidth(20, Unit.PIXELS);
        icon.getStyle().set("margin-right", "5px").set("margin-top", "2px");
        setPrefixComponent(icon);
        addClickListener(e -> {
            Communication.getBus().post(new CreateRepositoryEvent());
        });
    }

}
