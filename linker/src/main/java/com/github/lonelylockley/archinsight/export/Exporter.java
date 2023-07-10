package com.github.lonelylockley.archinsight.export;

import com.github.lonelylockley.archinsight.export.graphviz.ContainerExporter;
import com.github.lonelylockley.archinsight.export.graphviz.ContextExporter;
import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.translate.ContextDescriptor;

import java.util.EnumMap;
import java.util.Map;

public class Exporter {

    private final String projectName;

    private final Map<ArchLevel, ContextDescriptor> levelDescriptors = new EnumMap<>(ArchLevel.class);

    public Exporter(Tuple2<ContextDescriptor, ContextDescriptor> descriptors, String projectName) {
        this.projectName = projectName;
        if (descriptors._1 != null) {
            levelDescriptors.put(ArchLevel.CONTEXT, descriptors._1);
        }
        if (descriptors._2 != null) {
            levelDescriptors.put(ArchLevel.CONTAINER, descriptors._2);
        }
    }

    public String exportContext(Format format) {
        if (!levelDescriptors.containsKey(ArchLevel.CONTEXT)) {
            return ContextExporter.empty(projectName);
        }
        switch (format) {
            case GRAPHVIZ:
                ContextExporter exp = new ContextExporter(projectName, levelDescriptors.get(ArchLevel.CONTEXT));
                return exp.export();
            default:
                throw new IllegalArgumentException("Cannot export with " + format + " format");
        }
    }

    public String exportContainer(Format format) {
        if (!levelDescriptors.containsKey(ArchLevel.CONTAINER)) {
            return ContainerExporter.empty(projectName);
        }
        switch (format) {
            case GRAPHVIZ:
                ContainerExporter exp = new ContainerExporter(projectName, levelDescriptors.get(ArchLevel.CONTAINER));
                return exp.export();
            default:
                throw new IllegalArgumentException("Cannot export with " + format + " format");
        }
    }
}
