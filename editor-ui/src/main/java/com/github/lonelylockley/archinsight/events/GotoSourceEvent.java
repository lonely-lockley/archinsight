package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.translator.Symbol;

public class GotoSourceEvent extends BaseEvent {

    private final Symbol symbol;

    public GotoSourceEvent(Symbol declaration) {
        this.symbol = declaration;
    }

    public Symbol getSymbol() {
        return symbol;
    }
}
