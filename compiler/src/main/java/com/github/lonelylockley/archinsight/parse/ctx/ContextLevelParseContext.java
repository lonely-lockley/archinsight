package com.github.lonelylockley.archinsight.parse.ctx;

import com.github.lonelylockley.archinsight.model.elements.*;

public class ContextLevelParseContext extends ParseContext {

    public SystemElement.Builder startNewSystem() {
        SystemElement.Builder builder = new SystemElement.Builder();
        context.push(builder);
        type = builder.getType();
        return builder;
    }

    public PersonElement.Builder startNewPerson() {
        PersonElement.Builder builder = new PersonElement.Builder();
        context.push(builder);
        type = builder.getType();
        return builder;
    }

}
