package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.export.Exporter;
import com.github.lonelylockley.archinsight.export.Format;
import com.github.lonelylockley.archinsight.parse.TreeListener;
import com.github.lonelylockley.archinsight.translate.Generator;
import com.github.lonelylockley.archinsight.model.Source;
import com.github.lonelylockley.insight.lang.InsightLexer;
import com.github.lonelylockley.insight.lang.InsightParser;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Consumes;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Post;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.util.HttpClientAddressResolver;
import io.micronaut.runtime.Micronaut;
import org.antlr.v4.runtime.CharStreams;
import org.antlr.v4.runtime.CommonTokenStream;
import org.antlr.v4.runtime.atn.PredictionMode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.StringReader;

@Controller("/compile")
public class LinkerService {

    private static final Logger logger = LoggerFactory.getLogger(LinkerService.class);

    public static void main(String[] args) {
        Micronaut.run(LinkerService.class, args);
        logger.info("Linker server started");
    }

    private final HttpClientAddressResolver addressResolver;

    public LinkerService(HttpClientAddressResolver addressResolver) {
        this.addressResolver = addressResolver;
    }

    @Post
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Source compile(HttpRequest<Source> request, Source data) throws Exception {
        long startTime = System.nanoTime();
        var inputStream = CharStreams.fromReader(new StringReader(data.source));
        var lexer = new InsightLexer(inputStream);
        var tokenStream = new CommonTokenStream(lexer);
        var parser = new InsightParser(tokenStream);
        parser.getInterpreter().setPredictionMode(PredictionMode.LL);
        var listener = new TreeListener(lexer, parser);
        parser.addParseListener(listener);
        parser.insight();
        var pr = listener.getResult();
        /*
         * _1 - context
         * _2 - container
         */
        var sources = new Generator().generate(pr);
        var descriptors = new Linker().compile(sources, pr.getProjectName());
        var exp = new Exporter(descriptors, pr.getProjectName());
        var result = new Source();
        if (pr.hasContext()) {
            result.setSource(exp.exportContext(Format.GRAPHVIZ));
        }
        else
        if (pr.hasContainer()) {
            result.setSource(exp.exportContainer(Format.GRAPHVIZ));
        }
        else {
            logger.warn("Linker engine did not create any layer");
        }
        logger.info("Access: /compile from {} required {}ms",
                        addressResolver.resolve(request),
                        (System.nanoTime() - startTime) / 1000000
                    );
        return result;
    }

}
