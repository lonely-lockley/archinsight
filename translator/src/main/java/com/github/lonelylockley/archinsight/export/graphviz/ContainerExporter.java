package com.github.lonelylockley.archinsight.export.graphviz;

import com.github.lonelylockley.archinsight.export.ExporterBase;
import com.github.lonelylockley.archinsight.export.model.Aggregate;
import com.github.lonelylockley.archinsight.link.ContextDescriptor;
import org.jgrapht.Graph;
import org.jgrapht.graph.DefaultEdge;
import org.jgrapht.graph.DirectedAcyclicGraph;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ContainerExporter extends ExporterBase {

    public ContainerExporter(String project, ContextDescriptor descriptor) {
        super(project, descriptor);
    }

    private void writeAggregate(String root, Graph<String, DefaultEdge> g, Map<String, Aggregate> byId, int level, StringBuilder sb) {
        startAggregate(sb, byId.get(root), level);
        for (DefaultEdge edge : g.outgoingEdgesOf(root)) {
            writeAggregate(g.getEdgeTarget(edge), g, byId, level + 1, sb);
        }
        finishAggregate(sb, byId.get(root), level);
    }

    private void buildAggregateTree(StringBuilder sb, List<Aggregate> aggregates) {
        Graph<String, DefaultEdge> g = new DirectedAcyclicGraph<>(DefaultEdge.class);
        aggregates.forEach(a -> g.addVertex(a.getIdentifier()));
        Map<String, Aggregate> byId = new HashMap<>();
        for (Aggregate a : aggregates) {
            byId.put(a.getIdentifier(), a);
            a.getMembers().forEach(m -> {
                if (g.containsVertex(m.getIdentifier())) {
                    g.addEdge(a.getIdentifier(), m.getIdentifier());
                }
            });
        }

        g.vertexSet()
            .stream()
            .filter(v -> g.incomingEdgesOf(v).size() == 0)
            .forEach(root -> writeAggregate(root, g, byId, 1, sb));
    }

    @Override
    public String export() {
        StringBuilder sb = new StringBuilder();
        writeHeader(sb);
        super.levelDescriptor
                .blocks()
                .forEach(b -> writeBlock(sb, b));

        sb.append('\n');
        super.levelDescriptor
                .connections()
                .forEach(c -> writeConnection(sb, c));

        sb.append('\n');
        buildAggregateTree(sb, super.levelDescriptor.aggregates());
        finish(sb);

        return sb.toString();
    }

}
