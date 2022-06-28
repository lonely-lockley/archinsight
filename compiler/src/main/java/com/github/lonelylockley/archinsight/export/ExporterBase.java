package com.github.lonelylockley.archinsight.export;

import com.github.lonelylockley.archinsight.translate.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public abstract class ExporterBase {

    protected final String project;
    protected final ContextDescriptor levelDescriptor;

    private final Map<Block, List<Connection>> statistics;
    
    public ExporterBase(String project, ContextDescriptor descriptor) {
        this.project = project;
        levelDescriptor = descriptor;
        statistics = levelDescriptor
                        .connections()
                        .stream()
                        .collect(Collectors.groupingBy(Connection::getFrom));
    }

    protected void writeHeader(StringBuilder sb) {
        sb.append("digraph " + project + " {\n\n");
        sb.append("  labelloc=\"t\"\n");
        sb.append("  node [fontcolor=\"#ffffff\",fontsize=\"14px\",width=2,height=1,color=\"#ffffff\"]\n");
        sb.append("  edge [minlen=2,color=\"#303030\",fontcolor=\"#303030\",fontsize=\"8px\",penwidth=\"0.5\"]\n");
        sb.append("  overlap=false\n");
        sb.append("  rankdir=TB\n");
        sb.append("  nodesep=1\n");
        sb.append("  ranksep=1\n");
        sb.append("  splines=ortho\n\n");
    }

    private void writeLabelRow(StringBuilder sb, String text, boolean bold, boolean bracketed) {
        writeLabelRow(sb, text, null, bold, bracketed);
    }

    private void writeLabelRow(StringBuilder sb, String text, String fontStyle, boolean bold, boolean bracketed) {
        if (text != null) {
            sb.append("<tr><td>");
            if (bold) {
                sb.append("<b>");
            }
            if (fontStyle != null) {
                sb.append("<font ");
                sb.append(fontStyle);
                sb.append(">");
            }
            if (bracketed) {
                sb.append("[ ");
            }
            sb.append(multilineEscape(text));
            if (bracketed) {
                sb.append(" ]");
            }
            if (fontStyle != null) {
                sb.append("</font>");
            }
            if (bold) {
                sb.append("</b>");
            }
            sb.append("</td></tr>");
        }
    }

    protected void writeBlock(StringBuilder sb, Block b) {
        sb.append("  ");
        sb.append(b.getIdentifier());
        sb.append(" [label=<<table border=\"0\">");
        writeLabelRow(sb, b.getUpperLine(), true, false);
        writeLabelRow(sb, b.getMidLine(), "point-size=\"10px\"", false, true);
        writeLabelRow(sb, b.getLowerLine(), "point-size=\"10px\"", false, false);
        sb.append("</table>>,shape=");
        sb.append(b.getProperties().get("shape"));
        sb.append(",style=filled,");
        if (b.getProperties().containsKey("external")) {
            if ("true".equals(b.getProperties().get("external"))) {
                sb.append("fillcolor=\"#999999\"");
            }
            else {
                sb.append("fillcolor=\"#438dd5\"");
            }
        }
        else {
            sb.append("fillcolor=\"#08427B\"");
        }
        if (statistics.containsKey(b) && statistics.get(b).size() > 2) {
            if ("true".equals(b.getProperties().get("external"))) {
                sb.append(",height=");
                sb.append(String.valueOf(statistics.get(b).size()));
            }
            else {
                sb.append(",width=");
                sb.append(String.valueOf(statistics.get(b).size()));
            }
        }
        sb.append("]\n");
    }

    protected void writeConnection(StringBuilder sb, Connection c) {
        sb.append("  ");
        sb.append(c.getFrom().getIdentifier());
        sb.append(" -> ");
        sb.append(c.getTo().getIdentifier());
        if ("false".equals(c.getProperties().get("sync"))) {
            sb.append(" [arrowhead=\"open\",style=\"dashed\"");
        }
        else {
            sb.append(" [style=\"line\"");
        }
        if (c.getTextUpper() != null || c.getTextMid() != null || c.getTextLower() != null) {
            sb.append(",taillabel=<<table border=\"0\">");
            writeLabelRow(sb, c.getTextUpper(), true, false);
            writeLabelRow(sb, c.getTextMid(), false, true);
            writeLabelRow(sb, c.getTextLower(), false, false);
            sb.append("</table>>");
        }
        sb.append("]\n");
    }

    protected void startAggregate(StringBuilder sb, Aggregate a, int level) {
        String indent = "  ".repeat(level);
        sb.append(indent);
        sb.append("subgraph cluster_");
        sb.append(a.getIdentifier());
        sb.append(" {\n");
        sb.append(indent);
        if (a.getTextUpper() != null) {
            sb.append("  label=<<table border=\"0\">");
            writeLabelRow(sb, a.getTextUpper(), true, false);
            sb.append("</table>>\n");
        }
        sb.append(indent);
        sb.append("  margin=50\n");
        sb.append(indent);
        sb.append("  color=\"#08427B\"\n");
        sb.append(indent);
        sb.append("  style=dotted\n\n");
    }

    protected void finishAggregate(StringBuilder sb, Aggregate a, int level) {
        String ident = "  ".repeat(level);
        sb.append(ident);
        sb.append("  ");
        for (HasId member : a.getMembers()) {
            sb.append(member.getIdentifier());
            sb.append(", ");
        }
        sb.setLength(sb.length() - 2);
        sb.append('\n');
        sb.append(ident);
        sb.append("}\n\n");
    }

    protected void finish(StringBuilder sb) {
        sb.append("}");
    }

    public abstract String export();

    protected String multilineEscape(String source) {
        return source == null ? source : source.replaceAll("\n", "<br/>");
    }

    public static final String empty(String project) {
        return "digraph \"" + project + "\" {}";
    }

}
