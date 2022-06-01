package com.github.lonelylockley.archinsight.translate;

import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.parse.result.ParseResult;
import com.github.lonelylockley.archinsight.translate.level.ContainerTranslator;
import com.github.lonelylockley.archinsight.translate.level.ContextTranslator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Generator {

    private static final Logger logger = LoggerFactory.getLogger(Generator.class);

    public Tuple2<String, String> generate(ParseResult pr) {
        String context = null;
        if (pr.getContext().isDefined()) {
            Translator t = new ContextTranslator(pr.getProjectName(), pr.getContext());
            context = t.translate();
        }
        String container = null;
        if (pr.getContainer().isDefined()) {
            Translator t = new ContainerTranslator(pr.getProjectName(), pr.getContainer());
            container = t.translate();
        }
        if (logger.isDebugEnabled()) {
            logger.debug("==========================\n{}==========================\n{}", context, container);
        }
        return new Tuple2<>(context, container);
    }
}
