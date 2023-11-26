package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.ParsedFileDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.insight.lang.InsightLexer;
import com.github.lonelylockley.insight.lang.InsightParser;
import org.antlr.v4.runtime.CharStreams;
import org.antlr.v4.runtime.CommonTokenStream;
import org.apache.commons.lang3.StringUtils;

import java.io.StringReader;
import java.util.UUID;

public class Parser {

    private final TranslationContext ctx;

    public Parser(TranslationContext ctx) {
        this.ctx = ctx;
    }

    public ParseResult parse(String source, UUID fileId, String location) throws Exception {
        var listener = new InsightParseTreeListener(ctx);
        if (!StringUtils.isBlank(source)) {
            var errorListener = new InsightParseErrorListener(ctx, fileId, location);
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
        return listener.getResult();
    }

}
