package com.github.lonelylockley.archinsight.export.graphviz;

import com.github.lonelylockley.archinsight.export.ColorScheme;
import com.github.lonelylockley.archinsight.model.elements.BoundaryElement;
import com.github.lonelylockley.archinsight.model.elements.LinkElement;
import org.apache.commons.text.WordUtils;

import java.util.Map;
import java.util.UUID;

public abstract class TranslatorBase {

    protected final ColorScheme colorScheme;

    public TranslatorBase(ColorScheme colorScheme) {
        this.colorScheme = colorScheme;
    }

    public static final String empty(String project) {
        return "digraph \"" + project + "\" {}";
    }

    protected String multilineEscape(String source) {
        if (source == null || source.isEmpty()) {
            return " ";
        }
        else {
            return source.replaceAll("\n", "<br/>");
        }
    }

    private String wrapTextIfNotFormatted(String text) {
        if (text == null || text.contains("\n")) {
            return text;
        }
        else {
            return WordUtils.wrap(text, 50);
        }
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
            sb.append(multilineEscape(wrapTextIfNotFormatted(text)));
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

    private void writeProperties(StringBuilder sb, Map<String, String> properties) {
        for (Map.Entry<String, String> prop: properties.entrySet()) {
            sb.append(prop.getKey());
            sb.append("=\"");
            sb.append(prop.getValue());
            sb.append("\",");
        }
        sb.setLength(sb.length() - 1);
    }

    protected void writeHeader(StringBuilder sb, String projectName) {
        sb.append("digraph " + projectName + " {\n\n");
        sb.append("  labelloc=\"t\"\n");
        sb.append("  graph [bgcolor=\"");
        sb.append(colorScheme.getBackground());
        sb.append("\"]\n");
        sb.append("  node [fontcolor=\"");
        sb.append(colorScheme.getElementFontColor());
        sb.append("\",fontsize=\"14px\",width=2,height=1,color=\"");
        sb.append(colorScheme.getElementColor());
        sb.append("\"]\n");
        sb.append("  edge [minlen=1.5,color=\"");
        sb.append(colorScheme.getEdgeColor());
        sb.append("\",fontcolor=\"");
        sb.append(colorScheme.getEdgeFontColor());
        sb.append("\",fontsize=\"8px\",penwidth=\"0.7\"]\n");
        sb.append("  overlap=false\n");
        sb.append("  rankdir=TB\n");
        sb.append("  newrank=true\n");
        sb.append("  nodesep=1\n");
        sb.append("  ranksep=1\n");
        sb.append("  splines=spline\n\n");
    }

    protected void finish(StringBuilder sb) {
        sb.append("}");
    }

    protected void writeBlock(StringBuilder sb, UUID uniqueId, String declaredId, String name, String tech, String desc, int level, Map<String, String> properties) {
        String indent = "  ".repeat(level);
        sb.append(indent);
        sb.append(declaredId);
        sb.append(" [");
        if (uniqueId != null) {
            sb.append("id=\"");
            sb.append(uniqueId);
            sb.append("\",");
        }
        sb.append("tooltip=\"Alt/Option + Left Mouse Button click - go to declaration\",");
        sb.append("label=<<table border=\"0\">");
        writeLabelRow(sb, name, true, false);
        writeLabelRow(sb, tech, "point-size=\"10px\"", false, true);
        writeLabelRow(sb, desc, "point-size=\"10px\"", false, false);
        sb.append("</table>>,");
        writeProperties(sb, properties);
        sb.append("]\n");
    }

    protected void writeConnection(StringBuilder sb, LinkElement lm, Map<String, String> properties) {
        sb.append("  ");
        sb.append(lm.getFrom());
        sb.append(" -> ");
        sb.append(lm.getTo());
        sb.append(" [");
        writeProperties(sb, properties);
        if (lm.getName() != null || lm.getDescription() != null || lm.getTechnology() != null) {
            sb.append(",label=<<table border=\"0\">");
            writeLabelRow(sb, lm.getName(), true, false);
            writeLabelRow(sb, lm.getTechnology(), false, true);
            writeLabelRow(sb, lm.getDescription(), false, false);
            sb.append("</table>>");
        }
        sb.append("]\n");
    }

    protected void startAggregate(StringBuilder sb, BoundaryElement be, int level) {
        String indent = "  ".repeat(level);
        sb.append(indent);
        sb.append("subgraph cluster_");
        sb.append(be.getDeclaredId());
        sb.append(" {\n");
        sb.append(indent);
        if (be.getName() != null || be.getDescription() != null || be.getTechnology() != null) {
            sb.append("  label=<<table border=\"0\">");
            writeLabelRow(sb, be.getName(), true, false);
//            writeLabelRow(sb, be.getTechnology(), false, true);
//            writeLabelRow(sb, be.getDescription(), false, false);
            sb.append("</table>>\n");
        }
        else {
            sb.append("  label=\"\"\n");
        }
        sb.append(indent);
        sb.append("  margin=50\n");
        sb.append(indent);
        sb.append("  color=\"");
        sb.append(colorScheme.getClusterBorderColor());
        sb.append("\"\n");
        sb.append("  fontcolor=\"");
        sb.append(colorScheme.getClusterFontColor());
        sb.append("\"\n");
        sb.append(indent);
        sb.append("  style=dotted\n\n");
    }

    protected void finishAggregate(StringBuilder sb, BoundaryElement be, int level) {
        String ident = "  ".repeat(level);
        sb.append('\n');
        sb.append(ident);
        sb.append("}\n");
    }

}
