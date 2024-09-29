package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.translator.Declaration;

public class GotoSourceEvent extends BaseEvent {

    private final Declaration declaration;

    public GotoSourceEvent(Declaration declaration) {
        this.declaration = declaration;
    }

    public Declaration getDeclaration() {
        return declaration;
    }
}
