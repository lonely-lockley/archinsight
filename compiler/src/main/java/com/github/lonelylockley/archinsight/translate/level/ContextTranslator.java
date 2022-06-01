package com.github.lonelylockley.archinsight.translate.level;

import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.elements.Element;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.model.elements.LinkElement;
import com.github.lonelylockley.archinsight.model.elements.SystemElement;
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
                addParameter(sb, new Tuple2<>("sync", String.valueOf(lm.isSync())));
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
                addParameter(sb, new Tuple2<>("shape", "box"), new Tuple2<>("external", String.valueOf(sm.isExternal())));
                finishVariable(sb);
            }
            else
            if (el._2.getType() == ElementType.PERSON) {
                declareVariable(sb, "Block", el._1);
                addParameter(sb, el._1, true);
                addParameter(sb, el._2.getName(), true);
                addParameter(sb, el._2.getTechnology(), true);
                addParameter(sb, el._2.getDescription(), true);
                addParameter(sb, new Tuple2<>("shape", "egg"));
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
