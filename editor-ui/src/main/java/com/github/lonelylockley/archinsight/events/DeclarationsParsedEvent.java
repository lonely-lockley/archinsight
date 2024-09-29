package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.translator.Declaration;
import com.github.lonelylockley.archinsight.model.remote.translator.DeclarationContext;

import java.util.ArrayList;
import java.util.List;

public class DeclarationsParsedEvent extends BaseEvent {

    private List<DeclarationContext> declarations = new ArrayList<>();

    public DeclarationsParsedEvent(List<DeclarationContext> declarations) {
        this.declarations = declarations;
    }

    public List<DeclarationContext> getDeclarations() {
        return declarations;
    }
}
