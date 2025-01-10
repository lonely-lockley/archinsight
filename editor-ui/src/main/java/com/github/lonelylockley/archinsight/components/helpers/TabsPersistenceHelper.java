package com.github.lonelylockley.archinsight.components.helpers;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.lonelylockley.archinsight.components.EditorTabComponent;
import com.github.lonelylockley.archinsight.components.TabsComponent;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.FileRestoreEvent;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.vaadin.flow.dom.Element;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.Serializable;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.BiConsumer;

public class TabsPersistenceHelper {

    private static final Logger logger = LoggerFactory.getLogger(TabsComponent.class);
    private static final TypeReference<Map<String, StoredTab>> typeRef = new TypeReference<>() {};

    private final Element self;

    public TabsPersistenceHelper(Element self) {
        this.self = self;
    }

    private String getKey() {
        return Authentication.playgroundModeEnabled() ? "org.archinsight.playground.tabs" : "org.archinsight.editor.tabs";
    }

    public void storeTab(EditorTabComponent tab, Optional<String> source) {
        if (tab.getFileId() == null) {
            self.executeJs("window.tabState.storeTab($0, $1, $2)",
                    getKey(),
                    tab.getTabId(),
                    tab.getFile().getName());
        }
        else {
            self.executeJs("window.tabState.storeTab($0, $1, $2, $3)",
                    getKey(),
                    tab.getTabId(),
                    tab.getFile().getName(),
                    tab.getFileId().toString());
        }
        source.ifPresent(src -> storeSource(tab, src));
    }

    public void removeTab(EditorTabComponent tab) {
        var key = getKey();
        self.executeJs("window.tabState.removeTab($0, $1, $2)",
                key,
                tab.getTabId());
    }

    public void clearState() {
        self.executeJs("localStorage.removeItem($0)", getKey());
    }

    public void storeSource(EditorTabComponent tab, String source) {
        self.executeJs("window.tabState.storeCodeForTab($0, $1, $2)",
                getKey(),
                tab.getTabId(),
                source);
    }

    public void restoreOpenedTabs(BiConsumer<String, StoredTab> callback) {
        self.executeJs("return window.tabState.restoreTabs($0)", getKey()).then(String.class, tabsState -> {
            try {
                var tabs = new ObjectMapper().readValue(tabsState, typeRef);
                tabs.forEach(callback);
            }
            catch (Exception ex) {
                logger.error("Could not deserialize tab state", ex);
            }
        });
    }

    public static class StoredTab implements Serializable {
        private String name;
        private String fid;
        private String code;

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getFid() {
            return fid;
        }

        public void setFid(String fid) {
            this.fid = fid;
        }

        public String getCode() {
            return code;
        }

        public void setCode(String code) {
            this.code = code;
        }
    }

}
