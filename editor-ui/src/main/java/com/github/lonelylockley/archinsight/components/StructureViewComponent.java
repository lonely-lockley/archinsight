package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.translator.Symbol;
import com.google.common.collect.Ordering;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.dependency.CssImport;
import com.vaadin.flow.component.grid.contextmenu.GridContextMenu;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.icon.Icon;
import com.vaadin.flow.component.icon.VaadinIcon;
import com.vaadin.flow.component.orderedlayout.FlexComponent;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.treegrid.TreeGrid;
import com.vaadin.flow.data.provider.hierarchy.TreeData;

import java.util.*;

@CssImport("./styles/shared-styles.css")
public class StructureViewComponent extends TreeGrid<Symbol> {

    private final Map<String, Symbol> uniqueMappingsById = new HashMap<>();
    private final Map<UUID, Symbol> uniqueMappingsByFile = new HashMap<>();
    private final Map<String, Symbol> uniqueMappingsByTab = new HashMap<>();

    public StructureViewComponent(boolean readOnly) {
        setTreeData(new TreeData<>() {
            @Override
            public List<Symbol> getChildren(Symbol item) {
            var result = super.getChildren(item);
            if (result.size() > 1) {
                result = result.stream().sorted((left, right) -> {
                    final var l = left.getName() == null ? left.getDeclaredId() : left.getName();
                    final var r = right.getName() == null ? right.getDeclaredId() : right.getName();
                    return Ordering.natural().compare(l, r);
                }).toList();
            }
            return result;
            }
        });
        setClassName("prevent-select");
        setSelectionMode(SelectionMode.SINGLE);
        initContextMenu(readOnly);
        setAllRowsVisible(true);
        addComponentHierarchyColumn(symbol -> {
            final var label = new VerticalLayout();
            label.setPadding(false);
            label.setSpacing(false);
            String firstLineText;
            String secondLineText;
            Icon icon;
            if ("CONTEXT".equals(symbol.getElementType())) {
                icon = VaadinIcon.LIST.create();
                firstLineText = String.format("%s %s", symbol.getElementType().toLowerCase(), symbol.getDeclaredId());
                secondLineText = symbol.getFileName() == null ? "<New File>" : symbol.getLocation();
            }
            else {
                if ("STORAGE".equals(symbol.getElementType())) {
                    firstLineText = symbol.getTechnology();
                }
                else {
                    firstLineText = symbol.getName();
                }
                icon = VaadinIcon.CODE.create();
                secondLineText = String.format("%s%s [%s]", symbol.getExternal() ? "external " : "", symbol.getElementType().toLowerCase(), symbol.getDeclaredId());
            }
            final var firstLine = new Span(firstLineText);
            final var secondLine = new Span(secondLineText);
            secondLine.getStyle()
                    .set("font-size", "var(--lumo-font-size-s)")
                    .set("color", "var(--lumo-secondary-text-color)");
            label.add(firstLine);
            label.add(secondLine);
            final var row = new HorizontalLayout(icon, label);
            row.setAlignItems(FlexComponent.Alignment.CENTER);
            row.setHeight("40px");
            row.setSpacing(true);
            row.setId("gridnode_" + symbol.getDeclaredId());
            return row;
        }).setAutoWidth(true);

        addExpandListener((event) -> {
            recalculateColumnWidths();
        });

        final var declarationsParsedListener = new BaseListener<DeclarationsParsedEvent>() {
            @Override
            @Subscribe
            public void receive(DeclarationsParsedEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    if (e.isSuccess()) {
                        refreshTreeData(e);
                        getDataProvider().refreshAll();
                        for (Symbol symbol : e.getSymbols()) {
                            expand(symbol);
                            expand(symbol.getChildren());
                        }

                    }
                }
            }
        };
        Communication.getBus().register(declarationsParsedListener);

        final var svgElementClickedListener = new BaseListener<SVGElementClickedEvent>() {
            @Override
            @Subscribe
            public void receive(SVGElementClickedEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    var symbol = uniqueMappingsById.get(e.getElementId());
                    if (symbol != null) {
                        gotoSource(symbol);
                    }
                }
            }
        };
        Communication.getBus().register(svgElementClickedListener);

        final var fileChangeListener = new BaseListener<FileChangeEvent>() {
            @Override
            @Subscribe
            public void receive(FileChangeEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    var symbol = uniqueMappingsByFile.get(e.getUpdatedFile().getId());
                    if (symbol != null) {
                        final var oldName = symbol.getName();
                        symbol.setName(e.getUpdatedFile().getName());
                        if (oldName != null) {
                            final var newLocation = symbol.getLocation().substring(0, symbol.getLocation().length() - oldName.length());
                            symbol.setLocation(newLocation + e.getUpdatedFile().getName());
                        }
                        else {
                            symbol.setLocation(e.getUpdatedFile().getName());
                        }
                    }
                    getDataProvider().refreshAll();
                }
            }
        };
        Communication.getBus().register(fileChangeListener);

        final var fileCloseListener = new BaseListener<FileCloseRequestEvent>() {
            @Override
            @Subscribe
            public void receive(FileCloseRequestEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    if (e.getReason() == FileChangeReason.DELETED) {
                        for (UUID fileId : e.getDeletedObjects()) {
                            if (uniqueMappingsByFile.containsKey(fileId)) {
                                var root = uniqueMappingsByFile.remove(fileId);
                                getTreeData().removeItem(root);
                                for (Symbol system : root.getChildren()) {
                                    uniqueMappingsById.remove(system.getId());
                                    for (Symbol container : system.getChildren()) {
                                        uniqueMappingsById.remove(container.getId());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        Communication.getBus().register(fileCloseListener);

        final var repositoryCloseListener = new BaseListener<RepositoryCloseEvent>() {
            @Override
            @Subscribe
            public void receive(RepositoryCloseEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    getTreeData().clear();
                    uniqueMappingsByFile.clear();
                    uniqueMappingsById.clear();
                    uniqueMappingsByTab.clear();
                }
            }
        };
        Communication.getBus().register(repositoryCloseListener);

        addDetachListener(e -> {
            Communication.getBus().unregister(declarationsParsedListener);
            Communication.getBus().unregister(svgElementClickedListener);
            Communication.getBus().unregister(fileChangeListener);
            Communication.getBus().unregister(fileCloseListener);
            Communication.getBus().unregister(repositoryCloseListener);
        });

        addItemClickListener(e -> {
            if (e.getClickCount() == 2) {
                gotoSource(e.getItem());
            }
        });
    }

    private void refreshMappings(Symbol parent, Symbol symbol) {
        uniqueMappingsById.put(symbol.getId(), symbol);
        if (parent == null && symbol.getFileId() != null) {
            uniqueMappingsByFile.put(symbol.getFileId(), symbol);
        }
        if (parent == null && symbol.getTabId() != null) {
            uniqueMappingsByTab.put(symbol.getTabId(), symbol);
        }
    }

    private void refreshTreeData(DeclarationsParsedEvent e) {
        uniqueMappingsById.clear();
        uniqueMappingsByFile.clear();
        uniqueMappingsByTab.clear();
        getTreeData().clear();
        for (Symbol context : e.getSymbols()) {
            // root level -- contexts by origins
            getTreeData().addItem(null, context);
            refreshMappings(null, context);
            for (Symbol system : context.getChildren()) {
                // second level -- systems
                getTreeData().addItem(context, system);
                refreshMappings(context, system);
                for (Symbol container : system.getChildren()) {
                    // third level -- containers
                    getTreeData().addItem(system, container);
                    refreshMappings(system, container);
                }
            }
        }
    }

    private GridContextMenu<Symbol> initContextMenu(boolean readOnly) {
        var menu = addContextMenu();
        // =============================================================================================================
       var lb = new Span("Goto declaration");
        lb.setId("structure-tree-view-goto");
        final var goTo = menu.addItem(lb, event -> event.getItem().ifPresent(this::gotoSource));
        // =============================================================================================================
        lb = new Span("Insert id");
        lb.setId("repository-tree-view-id");
        final var insertId = menu.addItem(lb, event -> event.getItem().ifPresent(this::insertId));
        // =============================================================================================================
        lb = new Span("Insert import statement");
        lb.setId("structure-tree-view-full-import");
        final var insertImportFull = menu.addItem(lb, event -> event.getItem().ifPresent(this::insertFullImport));
        // =============================================================================================================
        menu.addGridContextMenuOpenedListener(event -> {
            if (getTreeData().getRootItems().isEmpty()) {
                goTo.setEnabled(false);
                insertId.setEnabled(false);
                insertImportFull.setEnabled(false);
            }
            else {
                goTo.setEnabled(true);
                insertId.setEnabled(true);
                insertImportFull.setEnabled(true);
            }
        });
        return menu;
    }

    /**
     * WARNING!!!
     * This component does not know about tab and file system changes, so in SymbolContext class information may be stale at some point
     * Files may be removed at the moment of menu activation
     * Tabs may be closed
     */
    private void gotoSource(Symbol selection) {
        // if file open or activate a tab, then navigate to declaration
        if (selection.getFileId() != null) {
            var node = new RepositoryNode();
            node.setType(RepositoryNode.TYPE_FILE);
            node.setId(selection.getFileId());
            node.setName(selection.getFileName());
            Communication.getBus().post(new FileOpenRequestEvent(node));
            Communication.getBus().post(new GotoSourceEvent(selection));
        }
        // if this is a new tab that was not persisted
        else {
            Communication.getBus().post(new TabActivationRequestEvent(selection.getTabId()));
            Communication.getBus().post(new GotoSourceEvent(selection));
        }
    }

    private void insertId(Symbol selection) {
        Communication.getBus().post(new EditorInsertEvent(selection.getDeclaredId()));
    }

    private void insertFullImport(Symbol selection) {
        var root = getTreeData().getParent(selection);
        if (!"CONTEXT".equals(root.getElementType())) {
            root = getTreeData().getParent(root);
        }
        Communication.getBus().post(new EditorInsertEvent(String.format("import %s from context %s", selection.getDeclaredId(), root.getDeclaredId())));
    }

}
