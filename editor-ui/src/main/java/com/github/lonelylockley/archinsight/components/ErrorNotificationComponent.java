package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.model.MessageLevel;
import com.vaadin.flow.component.Text;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.icon.Icon;
import com.vaadin.flow.component.notification.Notification;
import com.vaadin.flow.component.notification.NotificationVariant;
import com.vaadin.flow.component.orderedlayout.FlexComponent;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;

import static com.github.lonelylockley.archinsight.model.MessageLevel.*;

public class ErrorNotificationComponent extends Notification {

    public ErrorNotificationComponent(String message, MessageLevel level) {
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
        Div text = new Div(new Text(String.format("%s: %s", level, message)));

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
        setDuration(3000);
        open();
    }

}
