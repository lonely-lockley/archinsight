package com.github.lonelylockley.archinsight;

import com.helger.commons.lang.ClassPathHelper;
import com.vaadin.flow.server.VaadinServlet;
import com.vaadin.flow.server.startup.ServletDeployer;
import org.eclipse.jetty.annotations.AnnotationConfiguration;
import org.eclipse.jetty.plus.webapp.EnvConfiguration;
import org.eclipse.jetty.plus.webapp.PlusConfiguration;
import org.eclipse.jetty.server.CustomRequestLog;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.Slf4jRequestLogWriter;
import org.eclipse.jetty.util.resource.Resource;
import org.eclipse.jetty.util.resource.ResourceCollection;
import org.eclipse.jetty.webapp.*;
import org.eclipse.jetty.websocket.server.config.JettyWebSocketConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.ServletContextEvent;
import java.io.File;
import java.io.IOException;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.List;

/**
 * Run {@link #main(String[])} to launch your app in Embedded Jetty.
 * @author mavi
 */
public final class Launcher {

    private static final Logger logger = LoggerFactory.getLogger(Launcher.class);

    public static void main(String[] args) throws Exception {
        logger.info("Starting embedded Jetty server...");
        Server server = new Server(8080);

        var tempDir = setupTemporaryDirectory();

        var context = setupContext(server, tempDir);

        setupAccessLogs(server);

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

    private static WebAppContext setupContext(Server server, File tempDir) throws IOException {
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
        context.setBaseResource(Resource.newResource("editor-ui/frontend"));

        // The base resource is where jetty serves its static content from
        context.setExtraClasspath(resourceList);

        return context;
    }

    private static void setupAccessLogs(Server server) {
        var slfjRequestLogWriter = new Slf4jRequestLogWriter();
        slfjRequestLogWriter.setLoggerName("AccessLog");
        String format = "%{client}a - %u %t '%r' %s %O '%{Referer}i' '%{User-Agent}i' '%C'";
        var requestLog = new CustomRequestLog(slfjRequestLogWriter, format);
        server.setRequestLog(requestLog);
    }
}