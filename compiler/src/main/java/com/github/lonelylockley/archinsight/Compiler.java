package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.translate.ContextDescriptor;
import com.github.lonelylockley.archinsight.translate.Translator;
import org.mdkt.compiler.InMemoryJavaCompiler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Compiler {

    private static final Logger logger = LoggerFactory.getLogger(Compiler.class);

    private static final String contextName = "Context";
    private static final String containerName = "Container";

    private String generateName(String projectName, String className) {
        StringBuilder sb = new StringBuilder(Translator.packageDefinition);
        sb.append(projectName);
        sb.append('.');
        sb.append(className);
        return sb.toString();
    }

    public Tuple2<ContextDescriptor, ContextDescriptor> compile(Tuple2<String, String> sources, String projectName) throws Exception {
        InMemoryJavaCompiler compiler = InMemoryJavaCompiler.newInstance();
        ContextDescriptor context = null;
        ContextDescriptor container = null;
        try {
            if (sources._1 != null) {
                Class<?> clazz = compiler.compile(generateName(projectName, contextName), sources._1);
                context = (ContextDescriptor) clazz.getDeclaredConstructor().newInstance();
            }
        } catch (Exception ex) {
            logger.warn("Error found in source:\n" + sources._1);
            throw ex;
        }
        try {
            if (sources._2 != null) {
                Class<?> clazz = compiler.compile(generateName(projectName, containerName), sources._2);
                container = (ContextDescriptor) clazz.getDeclaredConstructor().newInstance();
            }
        } catch (Exception ex) {
            logger.warn("Error found in source:\n" + sources._2);
            throw ex;
        }
        return new Tuple2<>(context, container);
    }

}
