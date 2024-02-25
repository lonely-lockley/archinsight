package com.github.lonelylockley.archinsight;

import com.vaadin.flow.server.VaadinServlet;
import org.eclipse.jetty.ee10.annotations.AnnotationConfiguration;
import org.eclipse.jetty.ee10.plus.webapp.EnvConfiguration;
import org.eclipse.jetty.ee10.plus.webapp.PlusConfiguration;
import org.eclipse.jetty.ee10.webapp.*;
import org.eclipse.jetty.ee10.websocket.jakarta.server.config.JakartaWebSocketConfiguration;
import org.eclipse.jetty.server.CustomRequestLog;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.Slf4jRequestLogWriter;
import org.eclipse.jetty.util.resource.ResourceFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;

public final class Launcher {

    private static final Logger logger = LoggerFactory.getLogger(Launcher.class);

    public static void main(String[] args) throws Exception {
        logger.info("Starting embedded Jetty server...");
        Server server = new Server(8080);
        var mc = MicronautContext.getInstance();
        var tempDir = setupTemporaryDirectory();
        var context = setupContext(tempDir, mc.getConf().getDevMode());
        server.setHandler(context);

        setupAccessLogs(server, mc.getConf().getDevMode());

        server.start();
        logger.info("Server started at port 8080");
        server.join();
    }

    private static File setupTemporaryDirectory() {
        File tempDir = new File(System.getProperty("java.io.tmpdir"), "JettyTest");
        if (tempDir.exists()) {
            if (!tempDir.isDirectory()) {
                throw new RuntimeException("Not a directory: " + tempDir);
            }
        } else if (!tempDir.mkdirs()) {
            throw new RuntimeException("Could not make: " + tempDir);
        }
        return tempDir;
    }

    private static WebAppContext setupContext(File tempDir, boolean devMode) throws IOException {
        final var context = new WebAppContext();
        final var resourceFactory = ResourceFactory.of(context);
        context.setInitParameter("productionMode", String.valueOf(!devMode));

        // Context path of the application
        context.setContextPath("/");

        // Exploded WAR or not
        context.setExtractWAR(false);
        context.setTempDirectory(tempDir);

        // It pulls the respective config from the VaadinServlet
        context.addServlet(VaadinServlet.class, "/*");
        context.setAttribute(MetaInfConfiguration.CONTAINER_JAR_PATTERN, ".*");
        context.setParentLoaderPriority(true);

        context.setConfigurations(new Configuration[] {
                new AnnotationConfiguration(),
                new WebAppConfiguration(),
                new WebInfConfiguration(),
                new WebXmlConfiguration(),
                new MetaInfConfiguration(),
                new FragmentConfiguration(),
                new EnvConfiguration(),
                new PlusConfiguration(),
                new JettyWebXmlConfiguration(),
                new JakartaWebSocketConfiguration()
        });

        // It adds the web application resources. Styles, client-side components, ...
        context.setBaseResource(resourceFactory.newResource("editor-ui/frontend"));

        return context;
    }

    private static void setupAccessLogs(Server server, boolean devMode) {
        var slfjRequestLogWriter = new Slf4jRequestLogWriter();
        slfjRequestLogWriter.setLoggerName("AccessLog");
        String format = "%{client}a - %u [%{CF-Connecting-IP}i][%{CF-IPCountry}i] '%r' %s %{ms}Tms %O '%{Referer}i' '%{User-Agent}i'";
        if (devMode) {
            format = format + " '%C'"; // print cookies
        }
        var requestLog = new CustomRequestLog(slfjRequestLogWriter, format);
        server.setRequestLog(requestLog);
    }
}