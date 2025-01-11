package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.translator.DeclarationContext;

import java.util.List;

public class DeclarationsParsedEvent extends BaseEvent {

    private boolean success = false;
    private List<DeclarationContext> declarations = null;

    public DeclarationsParsedEvent(boolean success, List<DeclarationContext> declarations) {
        this.success = success;
        this.declarations = declarations;
    }

    public boolean isSuccess() {
        return success;
    }

    public List<DeclarationContext> getDeclarations() {
        return declarations;
    }
}
