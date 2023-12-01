package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.link.SourcePositionUtil;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import org.antlr.v4.runtime.ANTLRErrorListener;
import org.antlr.v4.runtime.Parser;
import org.antlr.v4.runtime.RecognitionException;
import org.antlr.v4.runtime.Recognizer;
import org.antlr.v4.runtime.atn.ATNConfigSet;
import org.antlr.v4.runtime.dfa.DFA;

import java.util.BitSet;
import java.util.UUID;

public class InsightParseErrorListener implements ANTLRErrorListener {

    private final TranslationContext ctx;
    private final UUID fileId;
    private final String location;

    public InsightParseErrorListener(TranslationContext ctx, UUID fileId, String location) {
        this.ctx = ctx;
        this.fileId = fileId;
        this.location = location;
    }

    @Override
    public void syntaxError(Recognizer<?, ?> recognizer, Object offendingSymbol, int line, int charPositionInLine, String msg, RecognitionException e) {
        TranslatorMessage lm = new TranslatorMessage(
                MessageLevel.ERROR,
                fileId,
                location,
                String.format("line %d:%d %s", line, charPositionInLine, msg)
        );
        SourcePositionUtil.copyPosition(lm, line, charPositionInLine, 0, 0);
        ctx.addMessage(lm);
    }

    @Override
    public void reportAmbiguity(Parser recognizer, DFA dfa, int startIndex, int stopIndex, boolean exact, BitSet ambigAlts, ATNConfigSet configs) {
    }

    @Override
    public void reportAttemptingFullContext(Parser recognizer, DFA dfa, int startIndex, int stopIndex, BitSet conflictingAlts, ATNConfigSet configs) {
    }

    @Override
    public void reportContextSensitivity(Parser recognizer, DFA dfa, int startIndex, int stopIndex, int prediction, ATNConfigSet configs) {
    }
}
