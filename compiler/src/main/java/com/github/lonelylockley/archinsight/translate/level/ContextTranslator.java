package com.github.lonelylockley.archinsight.translate.level;

import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.parse.result.LevelResult;
import com.github.lonelylockley.archinsight.translate.Translator;

import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class ContextTranslator extends Translator {

    public ContextTranslator(String projectName, LevelResult parseResult) {
        super(projectName, parseResult);
    }

    @Override
    protected String getLevel() {
        return "Context";
    }

    @Override
    public String translate() {
        StringBuilder sb = new StringBuilder();
        declarePackage(sb);
        declareImports(sb);
        declareClass(sb);
        // variables
        List<Tuple2<String, Element>> identifiers = parseResult
                .getElements()
                .stream()
                .map(tp -> new Tuple2<>(generateIdentifier(tp._1, tp._2), tp._2))
                .collect(Collectors.toList());
        identifiers.forEach(el -> {
            if (el._2.getType() == ElementType.LINK) {
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
            }
            else
            if (el._2.getType() == ElementType.SYSTEM) {
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
            }
            else
            if (el._2.getType() == ElementType.PERSON) {
                PersonElement pe = (PersonElement) el._2;
                declareVariable(sb, "Block", el._1);
                addParameter(sb, el._1, true);
                addParameter(sb, pe.getName(), true);
                addParameter(sb, pe.getTechnology(), true);
                addParameter(sb, pe.getDescription(), true);
                addParameter(sb, parseAttributes(pe,
                                new Tuple2<>("shape", "egg"),
                                new Tuple2<>("style", "filled"),
                                new Tuple2<>("fillcolor", "#08427B")
                        )
                );
                finishVariable(sb);
            }
            else {
                System.err.println("Don't know how to translate " + el._2.getType() + " for " + getLevel() + " level");
            }
        });
        // constructor and init
        declareConstructor(
                sb,
                identifiers.stream()
                    .filter(ident -> ident._2.getType() == ElementType.SYSTEM || ident._2.getType() == ElementType.PERSON),
                identifiers.stream()
                        .filter(ident -> ident._2.getType() == ElementType.LINK),
                Stream.empty()
        );
        finishClass(sb);

        return sb.toString();
    }

}
