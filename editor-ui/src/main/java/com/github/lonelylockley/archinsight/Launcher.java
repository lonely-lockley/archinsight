package com.github.lonelylockley.archinsight;

import com.helger.commons.lang.ClassPathHelper;
import com.vaadin.flow.server.VaadinServlet;
import com.vaadin.flow.server.communication.PushAtmosphereHandler;
import org.atmosphere.container.Jetty9WebSocketHandler;
import org.atmosphere.cpr.AsynchronousProcessor;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.util.resource.Resource;
import org.eclipse.jetty.util.resource.ResourceCollection;
import org.eclipse.jetty.webapp.Configuration;
import org.eclipse.jetty.webapp.WebAppContext;
import org.eclipse.jetty.websocket.server.JettyWebSocketServlet;
import org.eclipse.jetty.websocket.server.config.JettyWebSocketConfiguration;
import org.eclipse.jetty.websocket.server.config.JettyWebSocketServletContainerInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Run {@link #main(String[])} to launch your app in Embedded Jetty.
 * @author mavi
 */
public final class Launcher {

    private static final Logger logger = LoggerFactory.getLogger(Launcher.class);

    public static void main(String[] args) throws Exception {
        //com.vaadin.experimental.FeatureFlags
        logger.info("Starting embedded Jetty server...");
        Server server = new Server(8080);

        // Creation of a temporal directory
        File tempDir = new File(System.getProperty("java.io.tmpdir"), "JettyTest");
        if (tempDir.exists()) {
            if (!tempDir.isDirectory()) {
                throw new RuntimeException("Not a directory: " + tempDir);
            }
        } else if (!tempDir.mkdirs()) {
            throw new RuntimeException("Could not make: " + tempDir);
        }

        WebAppContext context = new WebAppContext();
        context.setInitParameter("productionMode", "true");

        // Context path of the application
        context.setContextPath("");

        // Exploded WAR or not
        context.setExtractWAR(false);
        context.setTempDirectory(tempDir);

        // It pulls the respective config from the VaadinServlet
        context.addServlet(VaadinServlet.class, "/*");

        context.setAttribute("org.eclipse.jetty.server.webapp.ContainerIncludeJarPattern", ".*");

        context.setParentLoaderPriority(true);
        context.getConfigurations().add(new Configuration[] {
                new JettyWebSocketConfiguration()
        });
        server.setHandler(context);

        // This add jars to the jetty classpath in a certain syntax and the pattern makes sure to load all of them
        List<Resource> resourceList = new ArrayList<>();
        for (String entry : ClassPathHelper.getAllClassPathEntries()) {
            File file = new File(entry);
            if (entry.endsWith(".jar")) {
                resourceList.add(Resource.newResource("jar:" + file.toURI().toURL() + "!/"));
            } else {
                resourceList.add(Resource.newResource(entry));
            }
        }

        // It adds the web application resources. Styles, client-side components, ...
        resourceList.add(Resource.newResource("editor-ui/frontend"));

        // The base resource is where jetty serves its static content from
        context.setBaseResource(new ResourceCollection(resourceList.toArray(new Resource[0])));

        server.start();
        logger.info("Server started at port 8080");
        server.join();
    }
}