package com.github.lonelylockley.archinsight.parse.ctx;

import com.github.lonelylockley.archinsight.model.elements.*;

import java.util.HashSet;
import java.util.Set;

public class ContainerLevelParseContext extends ParseContext {

    private boolean parsingModule = false;
    private Set<String> containerContent = null;

    public ServiceElement.Builder startNewService() {
        ServiceElement.Builder builder = new ServiceElement.Builder();
        context.push(builder);
        type = builder.getType();
        return builder;
    }

    public StorageElement.Builder startNewStorage() {
        StorageElement.Builder builder = new StorageElement.Builder();
        context.push(builder);
        type = builder.getType();
        return builder;
    }

    public ModuleElement.Builder startNewModule() {
        ModuleElement.Builder builder = new ModuleElement.Builder();
        context.push(builder);
        type = builder.getType();
        this.parsingModule = true;
        this.containerContent = new HashSet<>();
        return builder;
    }

    public Element finishElement() {
        this.parsingModule = false;
        return super.finishElement();
    }

    public boolean isParsingModule() {
        return parsingModule;
    }

    public void addContainerContent(String identifier) {
        containerContent.add(identifier);
    }

    public Set<String> getContainerContent() {
        return containerContent;
    }
}
