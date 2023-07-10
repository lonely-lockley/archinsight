package com.github.lonelylockley.archinsight.translate.level;

import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.parse.result.LevelResult;
import com.github.lonelylockley.archinsight.translate.Translator;

import java.util.List;
import java.util.stream.Collectors;

public class ContainerTranslator extends Translator {

    public ContainerTranslator(String projectName, LevelResult parseResult) {
        super(projectName, parseResult);
    }

    @Override
    protected String getLevel() {
        return "Container";
    }

    @Override
    public String translate() {
        StringBuilder sb = new StringBuilder();
        declarePackage(sb);
        declareImports(sb);
        declareClass(sb);
        List<Tuple2<String, Element>> identifiers = parseResult
                .getElements()
                .stream()
                .map(tp -> new Tuple2<>(generateIdentifier(tp._1, tp._2), tp._2))
                .toList();
        // variables
        identifiers.forEach(el -> {
            switch (el._2.getType()) {
                case LINK:
                    LinkElement lm = (LinkElement) el._2;
                    declareVariable(sb, "Connection", el._1);
                    addParameter(sb, el._1, true);
                    addParameter(sb, lm.getFrom(), false);
                    addParameter(sb, lm.getTo(), false);
                    addParameter(sb, lm.getName(), true);
                    addParameter(sb, lm.getTechnology(), true);
                    addParameter(sb, lm.getDescription(), true);
                    if (lm.isSync()) {
                        addParameter(sb, parseAttributes(lm,
                                            new Tuple2<>("style", "line")
                                        )
                        );
                    }
                    else {
                        addParameter(sb, parseAttributes(lm,
                                            new Tuple2<>("style", "dashed"),
                                            new Tuple2<>("arrowhead", "open")
                                        )
                        );
                    }
                    finishVariable(sb);
                    break;
                case SERVICE:
                    SystemElement sm = (SystemElement) el._2;
                    declareVariable(sb, "Block", el._1);
                    addParameter(sb, el._1, true);
                    addParameter(sb, sm.getName(), true);
                    addParameter(sb, sm.getTechnology(), true);
                    addParameter(sb, sm.getDescription(), true);
                    if (sm.isExternal()) {
                        addParameter(sb, parseAttributes(sm,
                                            new Tuple2<>("shape", "box"),
                                            new Tuple2<>("style", "filled"),
                                            new Tuple2<>("fillcolor", "#999999")
                                        )
                        );
                    }
                    else {
                        addParameter(sb, parseAttributes(sm,
                                            new Tuple2<>("shape", "box"),
                                            new Tuple2<>("style", "filled"),
                                            new Tuple2<>("fillcolor", "#438dd5")
                                        )
                        );
                    }
                    finishVariable(sb);
                    break;
                case STORAGE:
                    StorageElement st = (StorageElement) el._2;
                    declareVariable(sb, "Block", el._1);
                    parseAttributes(st);
                    addParameter(sb, el._1, true);
                    addParameter(sb, st.getName(), true);
                    addParameter(sb, st.getTechnology(), true);
                    addParameter(sb, st.getDescription(), true);
                    if (st.isExternal()) {
                        addParameter(sb, parseAttributes(st,
                                            new Tuple2<>("shape", "cylinder"),
                                            new Tuple2<>("style", "filled"),
                                            new Tuple2<>("fillcolor", "#4d4d4d")
                                        )
                        );
                    }
                    else {
                        addParameter(sb, parseAttributes(st,
                                            new Tuple2<>("shape", "cylinder"),
                                            new Tuple2<>("style", "filled"),
                                            new Tuple2<>("fillcolor", "#08427B")
                                        )
                        );
                    }
                    finishVariable(sb);
                    break;
                case MODULE:
                    ModuleElement me = (ModuleElement) el._2;
                    declareVariable(sb, "Aggregate", el._1);
                    addParameter(sb, el._1, true);
                    addParameter(sb, me.getName(), true);
                    addParameter(sb, me.getTechnology(), true);
                    addParameter(sb, me.getDescription(), true);
                    addParameter(sb, new Tuple2[0]);
                    for (String blockId : me.getContent()) {
                        addParameter(sb, blockId, false);
                    }
                    finishVariable(sb);
                    break;
                default:
                    System.err.println("Don't know how to translate " + el._2.getType() + " for " + getLevel() + " level");
                    break;
            }
        });
        declareConstructor(
                sb,
                identifiers.stream()
                        .filter(ident -> ident._2.getType() == ElementType.SERVICE || ident._2.getType() == ElementType.STORAGE),
                identifiers.stream()
                        .filter(ident -> ident._2.getType() == ElementType.LINK),
                identifiers.stream()
                        .filter(ident -> ident._2.getType() == ElementType.MODULE)
        );
        finishClass(sb);

        return sb.toString();
    }

}
