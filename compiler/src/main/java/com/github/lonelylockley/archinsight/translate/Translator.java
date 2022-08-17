package com.github.lonelylockley.archinsight.translate;

import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.elements.AnnotatedElement;
import com.github.lonelylockley.archinsight.model.elements.Element;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.model.elements.LinkElement;
import com.github.lonelylockley.archinsight.parse.result.LevelResult;

import java.lang.reflect.Array;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public abstract class Translator {

    public static final String packageDefinition = "com.github.lonelylockley.archinsight.gen.";

    protected final String projectName;
    protected final LevelResult parseResult;

    private int varNumber = 0;
    private Set<String> collisionResolveList = new HashSet<>();

    public Translator(String projectName, LevelResult parseResult) {
        this.projectName = projectName;
        this.parseResult = parseResult;
    }

    protected Tuple2<String, String>[] parseAttributes(AnnotatedElement el, Tuple2<String, String>... baseProperties) {
        if (el.getAnnotations().containsKey("@attribute")) {
            Map<String, Tuple2<String,String>> annotations = Arrays
                    .stream(el.getAnnotations().get("@attribute").split("(\\s*,\\s*)+"))
                    .filter(pair -> !pair.isBlank())
                    .map(pair -> {
                        int pos = pair.indexOf('=');
                        if (pos >= 0) {
                            return new Tuple2<>(pair.substring(0, pos), pair.substring(pos + 1));
                        }
                        else {
                            return new Tuple2<>(pair, "");
                        }
                    })
                    .collect(Collectors.toMap(Tuple2::_1, Function.identity()));
            Map<String, Tuple2<String,String>> res = Arrays.stream(baseProperties).collect(Collectors.toMap(Tuple2::_1, Function.identity()));
            res.putAll(annotations);
            Tuple2<String, String>[] tmp = (Tuple2<String, String>[]) new Tuple2[res.size()];
            int i = 0;
            for (Tuple2<String, String> annotation: res.values()) {
                tmp[i] = annotation;
                i++;
            }
            return tmp;
        }
        else {
            return baseProperties;
        }
    }

    protected String generateIdentifier(String proposedId, Element el) {
        String result = null;
        if (proposedId == null) {
            if (el.getType() == ElementType.LINK) {
                LinkElement lm = (LinkElement) el;
                StringBuilder sb = new StringBuilder();
                sb.append(lm.getFrom());
                sb.append('2');
                sb.append(lm.getTo());
                if (collisionResolveList.contains(sb.toString())) {
                    sb.append(String.valueOf(varNumber));
                    varNumber++;
                    assert !collisionResolveList.contains(sb.toString());
                    result = sb.toString();
                }
                else {
                    result = sb.toString();
                }
            }
            else {
                throw new IllegalArgumentException("Don't know how to generate identifier for element with type " + el.getType());
            }
        }
        else {
            result = proposedId;
        }
        assert result != null;
        collisionResolveList.add(result);
        return result;
    }

    protected void declarePackage(StringBuilder sb) {
        sb.append("package ");
        sb.append(packageDefinition);
        sb.append(projectName);
        sb.append(";\n\n");
    }

    protected void declareImports(StringBuilder sb, String... imports) {
        sb.append("import com.github.lonelylockley.archinsight.translate.*;\n");
        sb.append("import java.util.*;\n");
        for (String imp : imports) {
            sb.append("import ");
            sb.append(imp);
            sb.append(";\n");
        }
        sb.append(";\n");
    }

    protected void declareClass(StringBuilder sb) {
        sb.append("public class ");
        sb.append(getLevel());
        sb.append(" implements ContextDescriptor {\n");
    }

    protected void declareVariable(StringBuilder sb, String type, String name) {
        sb.append("    ");
        sb.append(type);
        sb.append(" ");
        sb.append(name);
        sb.append(" = new ");
        sb.append(type);
        sb.append("(");
    }

    private String escape(String s){
        return s.replace("\\", "\\\\")
                .replace("\t", "\\t")
                .replace("\b", "\\b")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\f", "\\f")
                .replace("\'", "\\'")
                .replace("\"", "\\\"");
    }

    protected void addParameter(StringBuilder sb, String value, boolean requiresQuotation) {
        if (requiresQuotation && value != null) {
            sb.append("\"");
            sb.append(escape(value));
            sb.append("\"");
        }
        else {
            sb.append(value);
        }
        sb.append(", ");
    }

    protected void addParameter(StringBuilder sb, String... values) {
        sb.append("new HashSet<>()");
        if (values.length > 0) {
            sb.append("{{ ");
            for (String value : values) {
                sb.append("add(\"");
                sb.append(value);
                sb.append("\"); ");
            }
            sb.append("}}");
        }
        sb.append(", ");
    }

    protected void addParameter(StringBuilder sb, Tuple2<String, String>... values) {
        sb.append("new HashMap<>()");
        if (values.length > 0) {
            sb.append("{{ ");
            for (Tuple2<String, String> value : values) {
                sb.append("put(\"");
                sb.append(value._1);
                sb.append("\", \"");
                sb.append(value._2);
                sb.append("\"); ");
            }
            sb.append("}}");
        }
        sb.append(", ");
    }

    protected void finishVariable(StringBuilder sb) {
        sb.setLength(sb.length() - 2);
        sb.append(");\n");
    }

    protected void declareConstructor(StringBuilder sb, Stream<Tuple2<String, Element>> blocks,
                                                        Stream<Tuple2<String, Element>> connections,
                                                        Stream<Tuple2<String, Element>> aggregations) {
        sb.append("\n");
        sb.append("    private final List<Block> blocks;\n");
        sb.append("    private final List<Connection> connections;\n");
        sb.append("    private final List<Aggregate> aggregates;\n");
        sb.append("\n");
        sb.append("    public ");
        sb.append(getLevel());
        sb.append("() {\n");
        sb.append("        this.blocks = Collections.unmodifiableList(new ArrayList<>() {{\n");
        blocks
                .forEach(ident -> sb.append("            add(")
                        .append(ident._1)
                        .append(");\n")
                );
        sb.append("        }});\n");
        sb.append("        this.connections = Collections.unmodifiableList(new ArrayList<>() {{\n");
        connections
                .forEach(ident -> sb.append("            add(")
                        .append(ident._1)
                        .append(");\n")
                );
        sb.append("        }});\n");
        sb.append("        this.aggregates = Collections.unmodifiableList(new ArrayList<>() {{\n");
        aggregations
                .forEach(ident -> sb.append("            add(")
                        .append(ident._1)
                        .append(");\n")
                );
        sb.append("        }});\n");
        sb.append("    }\n");
        sb.append("\n");
        sb.append("    @Override\n");
        sb.append("    public List<Block> blocks() {\n");
        sb.append("        return blocks;\n");
        sb.append("    }\n");
        sb.append("\n");
        sb.append("    @Override\n");
        sb.append("    public List<Connection> connections() {\n");
        sb.append("        return connections;\n");
        sb.append("    }\n");
        sb.append("\n");
        sb.append("    @Override\n");
        sb.append("    public List<Aggregate> aggregates() {\n");
        sb.append("        return aggregates;\n");
        sb.append("    }\n");
    }

    protected void finishClass(StringBuilder sb) {
        sb.append("}");
    }

    protected abstract String getLevel();

    public abstract String translate();

}
