package com.github.lonelylockley.archinsight.remote;

import com.github.lonelylockley.archinsight.Config;
import com.github.lonelylockley.archinsight.components.EditorTabComponent;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.DeclarationsParsedEvent;
import com.github.lonelylockley.archinsight.events.NotificationEvent;
import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TabData;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationRequest;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslationResult;
import jakarta.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Collection;
import java.util.UUID;

public class TranslatorSource {

    private static final Logger logger = LoggerFactory.getLogger(TranslatorSource.class);

    @Inject
    private TranslatorClient translator;

    @Inject
    private Config conf;

    private TranslationRequest prepareTranslationRequest(String tabId, UUID repositoryId, ArchLevel level, boolean darkMode, Collection<EditorTabComponent> tabs) {
        var res = new TranslationRequest();
        res.setRepositoryId(repositoryId);
        res.setTabId(tabId);
        res.setLevel(level);
        res.setDarkMode(darkMode);
        var tmp = new ArrayList<TabData>(tabs.size());
        for (EditorTabComponent tab: tabs) {
            var td = new TabData();
            td.setFileName(tab.getFile().getName());
            td.setTabId(tab.getTabId());
            td.setFileId(tab.getFileId());
            td.setSource(tab.getEditor().getCachedClientCode());
            tmp.add(td);
        }
        res.setTabs(tmp);
        return res;
    }

    public TranslationResult translate(String tabId, UUID repositoryId, ArchLevel level, boolean darkMode, Collection<EditorTabComponent> tabs) {
        long startTime = System.nanoTime();
        try {
            var translated = translator.translate(conf.getTranslatorAuthToken(), prepareTranslationRequest(tabId, repositoryId, level, darkMode, tabs));
            Communication.getBus().post(new DeclarationsParsedEvent(!translated.isHasErrors(), translated.getSymbols()));
            logger.info("Translation for {} required {}ms", tabId == null ? "repository " + repositoryId : tabId, (System.nanoTime() - startTime) / 1000000);
            return translated;
        }
        catch (Exception ex) {
            Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, "Could not parse repository structure"));
            logger.error(ex.getMessage(), ex);
            return new TranslationResult();
        }
    }
}
