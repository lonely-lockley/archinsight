package com.github.lonelylockley.archinsight;

import com.vaadin.flow.component.page.AppShellConfigurator;
import com.vaadin.flow.component.page.Inline;
import com.vaadin.flow.component.page.Push;
import com.vaadin.flow.component.page.TargetElement;
import com.vaadin.flow.server.AppShellSettings;
import com.vaadin.flow.shared.ui.Transport;
import com.vaadin.flow.theme.Theme;

@Theme("archinsight")
@Push(transport = Transport.WEBSOCKET)
public class VaadinConfigurator implements AppShellConfigurator {

    private final Config conf = MicronautContext.getInstance().getConf();
    private final String hotjarScript = """
                            (function(h,o,t,j,a,r){
                                h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
                                h._hjSettings={hjid:%s,hjsv:6};
                                a=o.getElementsByTagName('head')[0];
                                r=o.createElement('script');r.async=1;
                                r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
                                a.appendChild(r);
                            })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
                            """;

    @Override
    public void configurePage(AppShellSettings settings) {
        if (conf.getTrackingEnabled()) {
            settings.addInlineWithContents(
                    TargetElement.HEAD,
                    Inline.Position.APPEND,
                    String.format(hotjarScript, conf.getHotjarSiteId()),
                    Inline.Wrapping.JAVASCRIPT
            );
        }
    }

}
