package com.github.lonelylockley.archinsight.export.graphviz;

import com.github.lonelylockley.archinsight.export.ExporterBase;
import com.github.lonelylockley.archinsight.translate.ContextDescriptor;

public class ContextExporter extends ExporterBase {

    public ContextExporter(String project, ContextDescriptor descriptor) {
        super(project, descriptor);
    }

    @Override
    public String export() {
        StringBuilder sb = new StringBuilder();
        writeHeader(sb);
        super.levelDescriptor
                .blocks()
                .forEach(b -> writeBlock(sb, b));

        super.levelDescriptor
                .connections()
                .forEach(c -> writeConnection(sb, c));

        finish(sb);

        return sb.toString();
    }
}
