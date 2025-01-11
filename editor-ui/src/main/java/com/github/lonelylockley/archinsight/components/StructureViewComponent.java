package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.translator.Declaration;
import com.github.lonelylockley.archinsight.model.remote.translator.DeclarationContext;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.google.common.collect.Ordering;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.UI;
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
public class StructureViewComponent extends TreeGrid<StructureViewComponent.DeclarationWithParent> {

    private final Map<String, DeclarationWithParent> uniqueMappingsById = new HashMap<>();
    private final Map<UUID, DeclarationWithParent> uniqueMappingsByFile = new HashMap<>();

    private FileSystem fs;

    public StructureViewComponent(boolean readOnly) {
        setTreeData(new TreeData<>() {
            @Override
            public List<DeclarationWithParent> getChildren(DeclarationWithParent item) {
            var result = super.getChildren(item);
            if (result.size() > 1) {
                result = result.stream().sorted((left, right) -> Ordering.natural().compare(left.declaration.getName(), right.declaration.getName())).toList();
            }
            return result;
            }
        });
        setClassName("prevent-select");
        setSelectionMode(SelectionMode.SINGLE);
        initContextMenu(readOnly);
        setAllRowsVisible(true);
        addComponentHierarchyColumn(node -> {
            var tt = new VerticalLayout();
            tt.setPadding(false);
            tt.setSpacing(false);
            tt.add(new Span(node.declaration.getName()));
            String text;
            Icon icon;
            if (node.declaration.getExternal() == null) {
                icon = VaadinIcon.LIST.create();
                text = node.declaration.getDeclaredId();
            }
            else {
                icon = VaadinIcon.CODE.create();
                text = String.format("%s%s [%s]", node.declaration.getExternal() ? "ext " : "", node.declaration.getElementType().toLowerCase(), node.declaration.getDeclaredId());
            }
            var yy = new Span(text);
            yy.getStyle()
                    .set("font-size", "var(--lumo-font-size-s)")
                    .set("color", "var(--lumo-secondary-text-color)");
            tt.add(yy);
            var row = new HorizontalLayout(icon, tt);
            row.setAlignItems(FlexComponent.Alignment.CENTER);
            row.setHeight("40px");
            row.setSpacing(true);
            row.setId("gridnode_" + node.declaration.getDeclaredId());
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
                    if (e.isSuccess() || !(e.isSuccess() && e.getDeclarations().isEmpty())) {
                        uniqueMappingsById.clear();
                        uniqueMappingsByFile.clear();
                        getTreeData().clear();
                        final var roots = new ArrayList<DeclarationWithParent>(e.getDeclarations().size());
                        for (DeclarationContext dc : e.getDeclarations()) {
                            var tmp = new Declaration();
                            tmp.setName(String.format("%s %s", dc.getLevel().toLowerCase(), dc.getDeclaredId()));
                            tmp.setDeclaredId(dc.getLocation());
                            tmp.setElementType(dc.getLevel());
                            var root = new DeclarationWithParent(dc, tmp);
                            roots.add(root);
                            uniqueMappingsByFile.put(dc.getFileId(), root);
                            getTreeData().addItem(null, root);
                            for (Declaration decl : dc.getDeclarations()) {
                                var dwp = new DeclarationWithParent(dc, decl);
                                uniqueMappingsById.put(decl.getId().toString(), dwp);
                                getTreeData().addItem(root, dwp);
                            }
                        }
                        getDataProvider().refreshAll();
                        expand(roots);
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
                    var dwp = uniqueMappingsById.get(e.getElementId());
                    if (dwp != null) {
                        Communication.getBus().post(new GotoSourceEvent(dwp.getDeclaration()));
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
                    var dwp = uniqueMappingsByFile.get(e.getUpdatedFile().getId());
                    if (dwp != null) {
                        dwp.getContext().setLocation(e.getUpdatedFile().getName());
                        dwp.getDeclaration().setDeclaredId(e.getUpdatedFile().getName());
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
                                var dwp = uniqueMappingsByFile.remove(fileId);
                                getTreeData().removeItem(dwp);
                                for (Declaration decl : dwp.getContext().getDeclarations()) {
                                    uniqueMappingsById.remove(decl.getId().toString());
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

    private GridContextMenu<DeclarationWithParent> initContextMenu(boolean readOnly) {
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
        lb = new Span("Insert anonymous import");
        lb.setId("structure-tree-view-short-import");
        final var insertImportShort = menu.addItem(lb, event -> event.getItem().ifPresent(this::insertShortImport));
        // =============================================================================================================
        menu.addGridContextMenuOpenedListener(event -> {
            if (getTreeData().getRootItems().isEmpty()) {
                goTo.setEnabled(false);
                insertId.setEnabled(false);
                insertImportFull.setEnabled(false);
                insertImportShort.setEnabled(false);
            }
            else {
                goTo.setEnabled(true);
                insertId.setEnabled(true);
                insertImportFull.setEnabled(true);
                insertImportShort.setEnabled(true);
            }
        });
        return menu;
    }

    /**
     * WARNING!!!
     * This component does not know about tab and file system changes, so in DeclarationContext class information may be stale at some point
     * Files may be removed at the moment of menu activation
     * Tabs may be closed
     */
    private void gotoSource(StructureViewComponent.DeclarationWithParent selection) {
        // if file open or activate a tab, then navigate to declaration
        if (selection.getContext().getFileId() != null) {
            Communication.getBus().post(new FileOpenRequestEvent(fs.getNode(selection.getContext().getFileId())));
            Communication.getBus().post(new GotoSourceEvent(selection.getDeclaration()));
        }
        // if this is a new tab that was not persisted
        else {
            Communication.getBus().post(new TabActivationRequestEvent(selection.getContext().getTabId()));
            Communication.getBus().post(new GotoSourceEvent(selection.getDeclaration()));
        }
    }

    private void insertId(StructureViewComponent.DeclarationWithParent selection) {
        Communication.getBus().post(new EditorInsertEvent(selection.declaration.getDeclaredId()));
    }

    private void insertFullImport(StructureViewComponent.DeclarationWithParent selection) {
        var root = getTreeData().getParent(selection);
        Communication.getBus().post(new EditorInsertEvent(String.format("import %s %s from %s", selection.declaration.getElementType().toLowerCase(), selection.declaration.getDeclaredId(), root.declaration.getName())));
    }

    private void insertShortImport(StructureViewComponent.DeclarationWithParent selection) {
        var root = getTreeData().getParent(selection);
        Communication.getBus().post(new EditorInsertEvent(String.format("%s %s from %s", selection.declaration.getElementType().toLowerCase(), selection.declaration.getDeclaredId(), root.declaration.getName())));
    }

    public void fixTreeGridRowHeightCalculationBux() {
        UI.getCurrent().access(() -> {
            getElement().executeJs("setTimeout(() => { this.recalculateColumnWidths(); }, 100)");
        });
    }

    public static class DeclarationWithParent {

        private final DeclarationContext context;
        private final Declaration declaration;

        public DeclarationWithParent(DeclarationContext context, Declaration declaration) {
            this.context = context;
            this.declaration = declaration;
        }

        public DeclarationContext getContext() {
            return context;
        }

        public Declaration getDeclaration() {
            return declaration;
        }
    }

}
