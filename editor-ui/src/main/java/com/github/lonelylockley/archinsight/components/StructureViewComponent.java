package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.translator.Declaration;
import com.github.lonelylockley.archinsight.model.remote.translator.DeclarationContext;
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
public class StructureViewComponent extends TreeGrid<Declaration> {

    public StructureViewComponent(boolean readOnly) {
        setTreeData(new TreeData<>() {
            @Override
            public List<Declaration> getChildren(Declaration item) {
            var result = super.getChildren(item);
            if (result.size() > 1) {
                result = result.stream().sorted((left, right) -> Ordering.natural().compare(left.getName(), right.getName())).toList();
            }
            return result;
            }
        });
        setClassName("prevent-select");
        setSelectionMode(SelectionMode.NONE);
        initContextMenu(readOnly);
        addComponentHierarchyColumn(node -> {
            var tt = new VerticalLayout();
            tt.setPadding(false);
            tt.setSpacing(false);
            tt.add(new Span(node.getName()));
            String text;
            Icon icon;
            if (node.getExternal() == null) {
                icon = VaadinIcon.LIST.create();
                text = node.getDeclaredId();
            }
            else {
                icon = VaadinIcon.CODE.create();
                text = String.format("%s%s [%s]", node.getExternal() ? "ext " : "", node.getElementType().toLowerCase(), node.getDeclaredId());
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
            row.setId("gridnode_" + node.getDeclaredId());
//            if (filesWithErrors.contains(node.getId())) {
//                text.setClassName("contains-errors");
//            }
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
                    getTreeData().clear();
                    for (DeclarationContext dc : e.getDeclarations()) {
                        var root = new Declaration();
                        root.setName(String.format("%s %s", dc.getLevel().toLowerCase(), dc.getDeclaredId()));
                        root.setDeclaredId(dc.getLocation());
                        root.setElementType(dc.getLevel());
                        getTreeData().addItem(null, root);
                        for (Declaration decl : dc.getDeclarations()) {
                            getTreeData().addItem(root, decl);
                        }
                    }
                    getDataProvider().refreshAll();
                    expandRecursively(Collections.singletonList(null), 1);
                }
            }
        };
        Communication.getBus().register(declarationsParsedListener);

        addDetachListener(e -> {
            Communication.getBus().unregister(declarationsParsedListener);
        });

        addItemClickListener(e -> {
            if (e.getClickCount() == 2) {
                gotoSource(e.getItem());
            }
        });
    }

    private GridContextMenu<Declaration> initContextMenu(boolean readOnly) {
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
        lb = new Span("Insert full import");
        lb.setId("structure-tree-view-full-import");
        final var insertImportFull = menu.addItem(lb, event -> event.getItem().ifPresent(this::insertFullImport));
        // =============================================================================================================
        lb = new Span("Insert short import");
        lb.setId("structure-tree-view-short-import");
        final var insertImportShort = menu.addItem(lb, event -> event.getItem().ifPresent(this::insertShortImport));
        // =============================================================================================================
        return menu;
    }

    private void gotoSource(Declaration selection) {
        var root = getTreeData().getParent(selection);

    }

    private void insertId(Declaration selection) {
        Communication.getBus().post(new EditorInsertEvent(selection.getDeclaredId()));
    }

    private void insertFullImport(Declaration selection) {
        var root = getTreeData().getParent(selection);
        Communication.getBus().post(new EditorInsertEvent(String.format("import %s %s from %s", selection.getElementType().toLowerCase(), selection.getDeclaredId(), root.getName())));
    }

    private void insertShortImport(Declaration selection) {
        var root = getTreeData().getParent(selection);
        Communication.getBus().post(new EditorInsertEvent(String.format("%s %s from %s", selection.getElementType().toLowerCase(), selection.getDeclaredId(), root.getName())));
    }

    public void fixTreeGridRowHeightCalculationBux() {
        UI.getCurrent().access(() -> {
            getElement().executeJs("setTimeout(() => { this.recalculateColumnWidths(); }, 100)");
        });
    }

}
