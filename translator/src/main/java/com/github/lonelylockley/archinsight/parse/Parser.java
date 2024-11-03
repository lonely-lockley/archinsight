package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.github.lonelylockley.insight.lang.InsightLexer;
import com.github.lonelylockley.insight.lang.InsightParser;
import org.antlr.v4.runtime.CharStreams;
import org.antlr.v4.runtime.CommonTokenStream;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.StringReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Parser {

    private static final Logger logger = LoggerFactory.getLogger(Parser.class);

    private final TranslationContext ctx;

    public Parser(TranslationContext ctx) {
        this.ctx = ctx;
    }

    private ParseResult parse(Origin origin) {
        var source = origin.getContent();
        var listener = new InsightParseTreeListener(origin);
        try {
            if (!StringUtils.isBlank(source)) {
                var errorListener = new InsightParseErrorListener(ctx, origin);
                var inputStream = CharStreams.fromReader(new StringReader(source));
                var lexer = new InsightLexer(inputStream);
                lexer.removeErrorListeners();
                lexer.addErrorListener(errorListener);
                var tokenStream = new CommonTokenStream(lexer);
                var parser = new InsightParser(tokenStream);
                parser.removeErrorListeners();
                parser.addErrorListener(errorListener);
                parser.addParseListener(listener);
                parser.insight();
            }
        }
        catch (Exception ex) {
            logger.warn("Error parsing source", ex);
        }
        return listener.getResult();
    }

    private void copyParserMessages(Origin origin, TranslationContext ctx, List<TranslatorMessage> messages) {
        for (TranslatorMessage msg : messages) {
            msg.setTabId(origin.getTabId());
            msg.setFileId(origin.getFileId());
            msg.setLocation(origin.getLocation());
            ctx.addMessage(msg);
        }
    }

    public void parseRepository(TranslationContext ctx, FileSystem fs, List<Origin> origins) {
        origins.stream().parallel().forEach(origin -> {
            origin.defineLocation(fs);
            var pr = parse(origin);
            parseResultToDescriptors(ctx, pr);
            copyParserMessages(origin, ctx, pr.getMessages());
        });
    }

    private void parseResultToDescriptors(TranslationContext ctx, ParseResult result) {
        final var root = result.getRoot();
        final var boundedContextId = root.hasId().fold(WithId::getDeclaredId, () -> { throw new RuntimeException("Root element cannot exist without an id"); });
        boundedContextId.setBoundedContext(boundedContextId.getElementId());
        boundedContextId.setElementId(null);
        boundedContextId.setLevel(ArchLevel.CONTEXT);
        ElementType.CONTEXT.capture(root).foreach(ce -> {
            final var contextDescriptor = new ContextDescriptor(boundedContextId, ce);
            ctx.addRaw(result.getOrigin(), contextDescriptor);
        });
    }

}
