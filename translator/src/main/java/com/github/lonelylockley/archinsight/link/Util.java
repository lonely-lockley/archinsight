package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.github.lonelylockley.archinsight.parse.WithSource;
import org.antlr.v4.runtime.Token;

public class Util {
    public static void copyPosition(TranslatorMessage lm, WithSource el) {
        lm.setCharPosition(el.getCharPosition());
        lm.setLine(el.getLine());
        lm.setStartIndex(el.getStartIndex());
        lm.setStopIndex(el.getStopIndex());
    }

    public static void copyPosition(TranslatorMessage lm, Token tkn) {
        lm.setCharPosition(tkn.getCharPositionInLine());
        lm.setLine(tkn.getLine());
        lm.setStartIndex(tkn.getStartIndex());
        lm.setStopIndex(tkn.getStopIndex());
    }

    public static void copyPosition(TranslatorMessage lm, int line, int charPositionInLine, int startIndex, int stopIndex) {
        lm.setCharPosition(charPositionInLine);
        lm.setLine(line);
        lm.setStartIndex(startIndex);
        lm.setStopIndex(stopIndex);
    }
}
