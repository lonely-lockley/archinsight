package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.model.ParsedFileDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.remote.repository.FileData;
import com.github.lonelylockley.archinsight.remote.RepositoryClient;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.github.lonelylockley.insight.lang.InsightLexer;
import com.github.lonelylockley.insight.lang.InsightParser;
import jakarta.inject.Inject;
import org.antlr.v4.runtime.CharStreams;
import org.antlr.v4.runtime.CommonTokenStream;
import org.apache.commons.lang3.StringUtils;

import java.io.StringReader;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public class Parser {

    private final TranslationContext ctx;

    public Parser(TranslationContext ctx) {
        this.ctx = ctx;
    }

    public void parseRepository(TranslationContext ctx, FileSystem fs, List<FileData> files, UUID fileId, UUID repositoryId, String source) throws Exception {
        if (fileId != null && repositoryId != null) {
            for (FileData file : files) {
                if (!Objects.equals(file.getId(), fileId)) {
                    var location = fs.getPath(file.getId());
                    ctx.addDescriptor(new ParsedFileDescriptor(parse(file.getContent(), file.getId(), fs.getPath(file.getId())), location, file.getId()));
                }
            }
            // parse the source from client
            var location = fs.getPath(fileId);
            ctx.setEdited(new ParsedFileDescriptor(parse(source, fileId, location), location, fileId));
        }
        else {
            // parse the source from client
            var location = "/";
            ctx.setEdited(new ParsedFileDescriptor(parse(source, null, location), location, null));
        }
    }

    private ParseResult parse(String source, UUID fileId, String location) throws Exception {
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
