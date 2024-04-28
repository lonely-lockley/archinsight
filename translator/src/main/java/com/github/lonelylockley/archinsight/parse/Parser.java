package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.ParsedFileDescriptor;
import com.github.lonelylockley.archinsight.model.TabBoundedFileData;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.github.lonelylockley.insight.lang.InsightLexer;
import com.github.lonelylockley.insight.lang.InsightParser;
import org.antlr.v4.runtime.CharStreams;
import org.antlr.v4.runtime.CommonTokenStream;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.StringReader;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public class Parser {

    private static final Logger logger = LoggerFactory.getLogger(Parser.class);

    private final TranslationContext ctx;

    public Parser(TranslationContext ctx) {
        this.ctx = ctx;
    }

    public void parseRepository(TranslationContext ctx, FileSystem fs, List<TabBoundedFileData> tabs) {
        tabs.stream().parallel().forEach(tab -> {
            var location = tab.getId() == null ? tab.getFileName() : fs.getPath(tab.getId());
            var pr = parse(tab.getContent(), tab.getTabId(), tab.getId(), location);
            ctx.addDescriptor(new ParsedFileDescriptor(pr, location, Optional.ofNullable(tab.getTabId()), Optional.ofNullable(tab.getId())));
        });
    }

    private ParseResult parse(String source, String tabId, UUID fileId, String location) {
        var listener = new InsightParseTreeListener(ctx);
        try {
            if (!StringUtils.isBlank(source)) {
                var errorListener = new InsightParseErrorListener(ctx, tabId, fileId, location);
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

}
