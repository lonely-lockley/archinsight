package com.github.lonelylockley.archinsight;

import com.vaadin.flow.component.page.AppShellConfigurator;
import com.vaadin.flow.component.page.Push;
import com.vaadin.flow.shared.ui.Transport;
import com.vaadin.flow.theme.Theme;

@Theme("archinsight")
@Push(transport = Transport.WEBSOCKET)
public class VaadinConfigurator implements AppShellConfigurator {
}
