package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.remote.translator.Symbol;
import com.github.lonelylockley.archinsight.repository.FileSystem;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.Function;

public class SymbolCollector {

    private final FileSystem fs;
    private final TranslationContext ctx;

    public SymbolCollector(FileSystem fs, TranslationContext ctx) {
        this.fs = fs;
        this.ctx = ctx;
    }

    public List<Symbol> collect() {
        if (ctx.noErrors()) {
            return collectSymbols();
        }
        else {
            return Collections.emptyList();
        }
    }

    private Symbol elementToSymbol(AbstractElement el) {
        final var symbol = new Symbol();
        final var dynamicId = el.hasId().map(WithId::getDeclaredId).fold(Function.identity(), () -> null);
        symbol.setId(dynamicId.toString());
        symbol.setDeclaredId(dynamicId.getElementId() == null ? dynamicId.getBoundaryId() == null ? dynamicId.getBoundedContext() : dynamicId.getBoundaryId() : dynamicId.getElementId());
        symbol.setElementType(el.getType().getId());
        symbol.setExternal(el.hasExternal().fold(WithExternal::isExternal, () -> false));
        el.hasParameters().foreach(withParameters -> {
            symbol.setName(withParameters.getName());
            symbol.setTechnology(withParameters.getTechnology());
        });

        final var origin = el.getOrigin();
        symbol.setFileId(origin.getFileId());
        if (origin.getFile().isPresent()) {
            final var f = origin.getFile().get();
            symbol.setFileName(f.getFileName());
            symbol.setLocation(fs.getPath(f.getId()));
        }
        symbol.setTabId(origin.getTabId());

        symbol.setLine(el.getLine());
        symbol.setCharPosition(el.getCharPosition());
        symbol.setStartIndex(el.getStartIndex());
        symbol.setStopIndex(el.getStopIndex());
        return symbol;
    }

    private List<Symbol> collectSymbols() {
        final var symbols = new ArrayList<Symbol>();
        for (ParseDescriptor descriptor : ctx.getRaw()) {
            final var root = descriptor.getRoot();
            var symbol = elementToSymbol(root);
            collectSymbolsInternal(symbol, descriptor.getRootWithChildren(), descriptor);
            symbols.add(symbol);
        }
        return symbols;
    }

    private void collectSymbolsInternal(Symbol parent, WithChildElements root, ParseDescriptor descriptor) {
        root.getChildren()
                .stream()
                .filter(child -> child.getType() != ElementType.LINK)
                .filter(child -> descriptor.isDeclared(child.hasId().map(WithId::getDeclaredId).fold(DynamicId::getElementId, null)))
                .forEach(child -> {
                    var symbol = elementToSymbol(child);
                    child.hasChildren().foreach(ch -> collectSymbolsInternal(symbol, ch, descriptor));
                    parent.getChildren().add(symbol);
                });
    }

}
