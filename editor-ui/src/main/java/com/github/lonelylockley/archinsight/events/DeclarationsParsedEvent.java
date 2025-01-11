package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.translator.Symbol;

import java.util.List;

public class DeclarationsParsedEvent extends BaseEvent {

    private boolean success = false;
    private List<Symbol> symbols = null;

    public DeclarationsParsedEvent(boolean success, List<Symbol> declarations) {
        this.success = success;
        this.symbols = declarations;
    }

    public boolean isSuccess() {
        return success;
    }

    public List<Symbol> getSymbols() {
        return symbols;
    }
}
