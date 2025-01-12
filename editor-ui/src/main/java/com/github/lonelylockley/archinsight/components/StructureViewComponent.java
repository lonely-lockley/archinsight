package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.translator.Symbol;
import com.google.common.collect.Ordering;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.Component;
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
        setTreeData(sortedData());
        setClassName("prevent-select");
        setSelectionMode(SelectionMode.SINGLE);
        initContextMenu(readOnly);
        setAllRowsVisible(true);
        setHeightFull();
        addComponentHierarchyColumn(this::setupView).setAutoWidth(true);
        addExpandListener((event) -> {
            recalculateColumnWidths();
        });

        Communication.getBus().register(this,
                new BaseListener<DeclarationsParsedEvent>() {
                    @Override
                    @Subscribe
                    public void receive(DeclarationsParsedEvent e) {
                        e.getUIContext().access(() -> {
                            if (e.isSuccess()) {
                                refreshTreeData(e);
                                getDataProvider().refreshAll();
                                for (Symbol symbol : e.getSymbols()) {
                                    expand(symbol);
                                    expand(symbol.getChildren());
                                }
                            }
                        });
                    }
                },

                new BaseListener<SVGElementClickedEvent>() {
                    @Override
                    @Subscribe
                    public void receive(SVGElementClickedEvent e) {
                        e.getUIContext().access(() -> {
                            var symbol = uniqueMappingsById.get(e.getElementId());
                            if (symbol != null) {
                                gotoSource(symbol);
                            }
                        });
                    }
                },

                new BaseListener<FileChangeEvent>() {
                    @Override
                    @Subscribe
                    public void receive(FileChangeEvent e) {
                        e.getUIContext().access(() -> {
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
                                getDataProvider().refreshItem(symbol);
                            }
                        });
                    }
                },

                new BaseListener<FileCloseRequestEvent>() {
                    @Override
                    @Subscribe
                    public void receive(FileCloseRequestEvent e) {
                        e.getUIContext().access(() -> {
                            if (e.getReason() == FileChangeReason.DELETED) {
                                for (UUID fileId : e.getDeletedObjects()) {
                                    if (uniqueMappingsByFile.containsKey(fileId)) {
                                        var root = uniqueMappingsByFile.remove(fileId);
                                        uniqueMappingsById.remove(root.getId());
                                        getTreeData().removeItem(root);
                                        for (Symbol system : root.getChildren()) {
                                            uniqueMappingsById.remove(system.getId());
                                            for (Symbol container : system.getChildren()) {
                                                uniqueMappingsById.remove(container.getId());
                                            }
                                        }
                                    }
                                }
                                getDataProvider().refreshAll();
                            }
                        });
                    }
                },

                new BaseListener<RepositoryCloseEvent>() {
                    @Override
                    @Subscribe
                    public void receive(RepositoryCloseEvent e) {
                        e.getUIContext().access(() -> {
                            getTreeData().clear();
                            uniqueMappingsByFile.clear();
                            uniqueMappingsById.clear();
                            uniqueMappingsByTab.clear();
                        });
                    }
                },

                new BaseListener<TabCloseEvent>() {
                    @Override
                    @Subscribe
                    public void receive(TabCloseEvent e) {
                        e.getUIContext().access(() -> {
                            var root = uniqueMappingsByTab.remove(e.getTabId());
                            if (root != null && root.getFileId() == null) {
                                getTreeData().removeItem(root);
                                uniqueMappingsById.remove(root.getId());
                                for (Symbol system : root.getChildren()) {
                                    uniqueMappingsById.remove(system.getId());
                                    for (Symbol container : system.getChildren()) {
                                        uniqueMappingsById.remove(container.getId());
                                    }
                                }
                                getDataProvider().refreshAll();
                            }
                        });
                    }
                },

                new BaseListener<TabUpdateEvent>() {
                    @Override
                    @Subscribe
                    public void receive(TabUpdateEvent e) {
                        e.getUIContext().access(() -> {
                            var root = uniqueMappingsByTab.remove(e.getTabId());
                            if (root != null) {
                                root.setFileName(e.getName());
                                root.setLocation(e.getName());
                                root.setFileId(e.getFileId());
                                if (!uniqueMappingsByFile.containsKey(e.getFileId())) {
                                    uniqueMappingsByFile.put(e.getFileId(), root);
                                }
                                getDataProvider().refreshItem(root);
                            }
                        });
                    }
                });

        addItemClickListener(e -> {
            if (e.getClickCount() == 2) {
                gotoSource(e.getItem());
            }
        });
    }

    private TreeData<Symbol> sortedData() {
        return new TreeData<>() {
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
        };
    }

    private Component setupView(Symbol symbol) {
        final var label = new VerticalLayout();
        label.setPadding(false);
        label.setSpacing(false);
        String firstLineText;
        String secondLineText;
        Icon icon;
        if ("CONTEXT".equals(symbol.getElementType())) {
            icon = VaadinIcon.FILE_CODE.create();
            firstLineText = String.format("%s %s", symbol.getElementType().toLowerCase(), symbol.getDeclaredId());
            secondLineText = symbol.getFileName() == null ? "<New File>" : symbol.getLocation();
        }
        else {
            if ("STORAGE".equals(symbol.getElementType())) {
                icon = VaadinIcon.DATABASE.create();
                firstLineText = symbol.getTechnology();
            }
            else
            if ("SYSTEM".equals(symbol.getElementType())) {
                icon = VaadinIcon.CLUSTER.create();
                firstLineText = symbol.getName();
            }
            else {
                icon = VaadinIcon.CODE.create();
                firstLineText = symbol.getName();
            }
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
            if (event.getItem().stream().allMatch(symbol -> "CONTEXT".equals(symbol.getElementType()))) {
                insertImportFull.setVisible(false);
            }
            else {
                insertImportFull.setVisible(true);
            }
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
        if ("SYSTEM".equals(selection.getElementType())) {
            Communication.getBus().post(new EditorInsertEvent(String.format("import %s from context %s", selection.getDeclaredId(), root.getDeclaredId())));
        }
        else {
            Communication.getBus().post(new EditorInsertEvent(String.format("%s from %s", selection.getDeclaredId(), root.getDeclaredId())));
        }
    }

}
