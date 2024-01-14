package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.vaadin.flow.component.Html;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.icon.Icon;
import com.vaadin.flow.component.notification.Notification;
import com.vaadin.flow.component.notification.NotificationVariant;
import com.vaadin.flow.component.orderedlayout.FlexComponent;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;

public class NotificationComponent extends Notification {

    public NotificationComponent(String message, MessageLevel level) {
        new NotificationComponent(message, level, -1);
    }

    public NotificationComponent(String message, MessageLevel level, int durationMillis) {
        switch (level) {
            case NOTICE:
                addThemeVariants(NotificationVariant.LUMO_CONTRAST);
                break;
            case WARNING:
                addThemeVariants(NotificationVariant.LUMO_PRIMARY);
                break;
            case ERROR:
                addThemeVariants(NotificationVariant.LUMO_ERROR);
                break;
        }
        var text = new Html(String.format("<div>%s</div>", message
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll("\n", "<br/>")
        ));

        Button closeButton = new Button(new Icon("lumo", "cross"));
        closeButton.addThemeVariants(ButtonVariant.LUMO_TERTIARY_INLINE);
        closeButton.getElement().setAttribute("aria-label", "Close");
        closeButton.addClickListener(event -> {
            close();
        });

        HorizontalLayout layout = new HorizontalLayout(text, closeButton);
        layout.setAlignItems(FlexComponent.Alignment.START);
        add(layout);

        setPosition(Position.BOTTOM_END);
        if (durationMillis > 0) {
            setDuration(durationMillis);
        }
        open();
    }

}
