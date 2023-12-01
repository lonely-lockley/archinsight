package com.github.lonelylockley.archinsight.screens;

import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.router.*;
import com.vaadin.flow.server.auth.AnonymousAllowed;
import jakarta.servlet.http.HttpServletResponse;

@AnonymousAllowed
public class NotFoundErrorView extends VerticalLayout implements BaseView, HasErrorParameter<NotFoundException> {

    @Override
    public int setErrorParameter(BeforeEnterEvent event, ErrorParameter<NotFoundException> parameter) {
        add(new Span("The requested resource was not found on the server"));
        addFooter(this);
        setHeight("100%");
        applyDarkTheme(getElement());
        return HttpServletResponse.SC_NOT_FOUND;
    }
}