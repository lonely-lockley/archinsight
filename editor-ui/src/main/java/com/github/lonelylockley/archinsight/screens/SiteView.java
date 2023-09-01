package com.github.lonelylockley.archinsight.screens;

import com.vaadin.flow.component.Component;
import com.vaadin.flow.component.UI;
import com.vaadin.flow.component.Unit;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.Image;
import com.vaadin.flow.component.html.Label;
import com.vaadin.flow.component.orderedlayout.FlexLayout;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.router.*;

@Route("")
@PageTitle("Archinsight")
public class SiteView extends VerticalLayout implements BaseView, HasUrlParameter<String> {

    private static final int grossContentWidth = 1000;
    private static final int margin = 5;

    public SiteView() {
        setAlignItems(Alignment.CENTER);
        var holder = new Div();
        holder.setWidth(grossContentWidth, Unit.PIXELS);
        var greeting = createGreeting();
        holder.add(greeting);
        var content = createContent();
        holder.add(content);
        setSizeFull();
        add(holder);
        addFooter(this);
        applyDarkTheme(getElement());
    }

    private Component createContent() {
        var content = new VerticalLayout();
        content.setMargin(false);
        content.getElement().getStyle().set("margin-left", "50px");
        content.setPadding(false);
        // code background =============================================================================================
        var bg = new Div();
        bg.setClassName("bg_code");
        bg.getElement().setProperty("innerHTML", """
                <span style="color: #6C7A89;">&nbsp;&nbsp;1&nbsp;&nbsp;</span><span style="color: #3dc9b0;">container</span> archinsight<br>
                <span style="color: #6C7A89;">&nbsp;&nbsp;2&nbsp;&nbsp;</span><br>
                <span style="color: #6C7A89;">&nbsp;&nbsp;3&nbsp;&nbsp;</span><span style="color: #3dc9b0;">service</span> front<br>
                <span style="color: #6C7A89;">&nbsp;&nbsp;4&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">name =</span> <span style="color: #ce9178;">Frontend</span><br>
                <span style="color: #6C7A89;">&nbsp;&nbsp;5&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">Monako, React</span><br>
                <span style="color: #6C7A89;">&nbsp;&nbsp;6&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">links:</span><br>
                <span style="color: #6C7A89;">&nbsp;&nbsp;7&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">-&gt;</span> bff<br>
                <span style="color: #6C7A89;">&nbsp;&nbsp;8&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">HTTP, REST</span><br>
                <span style="color: #6C7A89;">&nbsp;&nbsp;9&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">desc =</span> <span style="color: #ce9178;">API calls</span><br>
                <span style="color: #6C7A89;">&nbsp;10&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">-&gt;</span> editor<br>
                <span style="color: #6C7A89;">&nbsp;11&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">HTTP, REST</span><br>
                <span style="color: #6C7A89;">&nbsp;12&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">desc =</span> <span style="color: #ce9178;">Load frontend</span><br>
                <span style="color: #6C7A89;">&nbsp;13&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">-&gt;</span> google<br>
                <span style="color: #6C7A89;">&nbsp;14&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">HTTP, REST</span><br>
                <span style="color: #6C7A89;">&nbsp;15&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">desc =</span> <span style="color: #ce9178;">Authenticate with Google</span><br>
                <span style="color: #6C7A89;">&nbsp;16&nbsp;&nbsp;</span><br>
                <span style="color: #6C7A89;">&nbsp;17&nbsp;&nbsp;</span><span style="color: #3dc9b0;">service</span> editor<br>
                <span style="color: #6C7A89;">&nbsp;18&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">name =</span> <span style="color: #ce9178;">Editor-UI</span><br>
                <span style="color: #6C7A89;">&nbsp;19&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">Nginx, Javascript, ??</span><br>
                <span style="color: #6C7A89;">&nbsp;20&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">desc =</span> <span style="color: #ce9178;">Serves application frontend</span><br>
                <span style="color: #6C7A89;">&nbsp;21&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">logic and static data</span><br>
                <span style="color: #6C7A89;">&nbsp;22&nbsp;&nbsp;</span><br>
                <span style="color: #6C7A89;">&nbsp;23&nbsp;&nbsp;</span><span style="color: #ffc600;">@attribute(width=15)</span><br>
                <span style="color: #6C7A89;">&nbsp;24&nbsp;&nbsp;</span><span style="color: #3dc9b0;">service</span> bff<br>
                <span style="color: #6C7A89;">&nbsp;25&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">name =</span> <span style="color: #ce9178;">BFF</span><br>
                <span style="color: #6C7A89;">&nbsp;26&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">NodeJs</span><br>
                <span style="color: #6C7A89;">&nbsp;27&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">desc =</span> <span style="color: #ce9178;">Center point for all API requests. Checks authorization</span><br>
                <span style="color: #6C7A89;">&nbsp;28&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">and authentication, orchestrates backend API calls</span><br>
                <span style="color: #6C7A89;">&nbsp;29&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">links:</span><br>
                <span style="color: #6C7A89;">&nbsp;30&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">-&gt;</span> compiler<br>
                <span style="color: #6C7A89;">&nbsp;31&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">HTTP, REST</span><br>
                <span style="color: #6C7A89;">&nbsp;32&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">-&gt;</span> renderer<br>
                <span style="color: #6C7A89;">&nbsp;33&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">HTTP, REST</span><br>
                <span style="color: #6C7A89;">&nbsp;34&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">-&gt;</span> repository<br>
                <span style="color: #6C7A89;">&nbsp;35&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">HTTP, REST</span><br>
                <span style="color: #6C7A89;">&nbsp;36&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">-&gt;</span> profile<br>
                <span style="color: #6C7A89;">&nbsp;37&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">HTTP, REST</span><br>
                <span style="color: #6C7A89;">&nbsp;38&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">-&gt;</span> google<br>
                <span style="color: #6C7A89;">&nbsp;39&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">HTTP</span><br>
                <span style="color: #6C7A89;">&nbsp;40&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">desc =</span> <span style="color: #ce9178;">Get public certs in PEM format to</span><br>
                <span style="color: #6C7A89;">&nbsp;41&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">verivy token integrity</span><br>
                <span style="color: #6C7A89;">&nbsp;42&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">https://www.googleapis.com/oauth2/v1/certs</span><br>
                <span style="color: #6C7A89;">&nbsp;43&nbsp;&nbsp;</span><br>
                <span style="color: #6C7A89;">&nbsp;44&nbsp;&nbsp;</span><span style="color: #3dc9b0;">service</span> compiler<br>
                <span style="color: #6C7A89;">&nbsp;45&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">name =</span> <span style="color: #ce9178;">Compiler</span><br>
                <span style="color: #6C7A89;">&nbsp;46&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">Java, Micronaut</span><br>
                <span style="color: #6C7A89;">&nbsp;47&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">desc =</span> <span style="color: #ce9178;">Translates Insight sources</span><br>
                <span style="color: #6C7A89;">&nbsp;48&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">into Java language and performs</span><br>
                <span style="color: #6C7A89;">&nbsp;49&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">compilation for integrity checks.</span><br>
                <span style="color: #6C7A89;">&nbsp;50&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">If everything's okay, generates</span><br>
                <span style="color: #6C7A89;">&nbsp;51&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">DOT schema definition for `Renderer`</span><br>
                <span style="color: #6C7A89;">&nbsp;52&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">-</span><br>
                <span style="color: #6C7A89;">&nbsp;53&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">In future, subject to be replaced by</span><br>
                <span style="color: #6C7A89;">&nbsp;54&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">`linker` service. Aim - is to get</span><br>
                <span style="color: #6C7A89;">&nbsp;55&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">rid of Java stage and perform</span><br>
                <span style="color: #6C7A89;">&nbsp;56&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">checks with own logic</span><br>
                <span style="color: #6C7A89;">&nbsp;57&nbsp;&nbsp;</span><br>
                <span style="color: #6C7A89;">&nbsp;58&nbsp;&nbsp;</span><span style="color: #3dc9b0;">service</span> renderer<br>
                <span style="color: #6C7A89;">&nbsp;59&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">name =</span> <span style="color: #ce9178;">Renderer</span><br>
                <span style="color: #6C7A89;">&nbsp;60&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">Java, Micronaut</span><br>
                <span style="color: #6C7A89;">&nbsp;61&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">desc =</span> <span style="color: #ce9178;">Renders DOT schema definitions</span><br>
                <span style="color: #6C7A89;">&nbsp;62&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">to various formats:</span><br>
                <span style="color: #6C7A89;">&nbsp;63&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">- SVG</span><br>
                <span style="color: #6C7A89;">&nbsp;64&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">- PNG</span><br>
                <span style="color: #6C7A89;">&nbsp;65&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">---</span><br>
                <span style="color: #6C7A89;">&nbsp;66&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">Subj to be removed when we'll be ready</span><br>
                <span style="color: #6C7A89;">&nbsp;67&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">to move to client side rendering with</span><br>
                <span style="color: #6C7A89;">&nbsp;68&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">D3 and WASM</span><br>
                <span style="color: #6C7A89;">&nbsp;69&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">https://github.com/magjac/d3-graphviz</span><br>
                <span style="color: #6C7A89;">&nbsp;70&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">links:</span><br>
                <span style="color: #6C7A89;">&nbsp;71&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">-&gt;</span> github<br>
                <span style="color: #6C7A89;">&nbsp;72&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">Git SSH</span><br>
                <span style="color: #6C7A89;">&nbsp;73&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">desc =</span> <span style="color: #ce9178;">Manage data in repositories</span><br>
                <span style="color: #6C7A89;">&nbsp;74&nbsp;&nbsp;</span><br>
                <span style="color: #6C7A89;">&nbsp;75&nbsp;&nbsp;</span><span style="color: #ffc600;">@attribute(width=5)</span><br>
                <span style="color: #6C7A89;">&nbsp;76&nbsp;&nbsp;</span><span style="color: #3dc9b0;">service</span> repository<br>
                <span style="color: #6C7A89;">&nbsp;77&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">name =</span> <span style="color: #ce9178;">Repository</span><br>
                <span style="color: #6C7A89;">&nbsp;78&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">Java, Micronaut, Git-SCM</span><br>
                <span style="color: #6C7A89;">&nbsp;79&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">desc =</span> <span style="color: #ce9178;">Runs all Git operations with repositories:</span><br>
                <span style="color: #6C7A89;">&nbsp;80&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- <span style="color: #ce9178;">on project open clones repository into temporary directory</span><br>
                <span style="color: #6C7A89;">&nbsp;81&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- <span style="color: #ce9178;">switches to user's branch</span><br>
                <span style="color: #6C7A89;">&nbsp;82&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- <span style="color: #ce9178;">returns project structure</span><br>
                <span style="color: #6C7A89;">&nbsp;83&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- <span style="color: #ce9178;">performs CRUD operations for files and directories in a project</span><br>
                <span style="color: #6C7A89;">&nbsp;84&nbsp;&nbsp;</span><br>
                <span style="color: #6C7A89;">&nbsp;85&nbsp;&nbsp;</span><span style="color: #3dc9b0;">service</span> profile<br>
                <span style="color: #6C7A89;">&nbsp;86&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">name =</span> <span style="color: #ce9178;">Profile</span><br>
                <span style="color: #6C7A89;">&nbsp;87&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">TDB ???</span><br>
                <span style="color: #6C7A89;">&nbsp;88&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">desc =</span> <span style="color: #ce9178;">Stores user profile information,</span><br>
                <span style="color: #6C7A89;">&nbsp;89&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">SSH keys, project Git links, etc</span><br>
                <span style="color: #6C7A89;">&nbsp;90&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">links:</span><br>
                <span style="color: #6C7A89;">&nbsp;91&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">-&gt;</span> profile_store</span><br>
                <span style="color: #6C7A89;">&nbsp;92&nbsp;&nbsp;</span><br>
                <span style="color: #6C7A89;">&nbsp;93&nbsp;&nbsp;</span><span style="color: #3dc9b0;">storage</span> profile_store<br>
                <span style="color: #6C7A89;">&nbsp;94&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">tech =</span> <span style="color: #ce9178;">Postgres</span><br>
                <span style="color: #6C7A89;">&nbsp;95&nbsp;&nbsp;</span><br>
                <span style="color: #6C7A89;">&nbsp;96&nbsp;&nbsp;</span><span style="color: #3dc9b0;">ext service</span> google<br>
                <span style="color: #6C7A89;">&nbsp;97&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">name =</span> <span style="color: #ce9178;">Google ID</span><br>
                <span style="color: #6C7A89;">&nbsp;98&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">desc =</span> <span style="color: #ce9178;">Oauth 2.0 provider</span><br>
                <span style="color: #6C7A89;">&nbsp;99&nbsp;&nbsp;</span><br>
                <span style="color: #6C7A89;">100&nbsp;&nbsp;</span><span style="color: #3dc9b0;">ext service</span> github<br>
                <span style="color: #6C7A89;">101&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">name =</span> <span style="color: #ce9178;">Github</span><br>
                <span style="color: #6C7A89;">102&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ffc600;">desc =</span> <span style="color: #ce9178;">Git storage for</span><br>
                <span style="color: #6C7A89;">103&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">project files, PR and</span><br>
                <span style="color: #6C7A89;">104&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #ce9178;">user management</span><br>
                                                                                                                        
                """);
        // project motivation ==========================================================================================
        var lb = new Div();
        lb.getElement().getStyle().set("text-align", "justify");
        lb.getElement().setProperty("innerHTML", """
                        Archinsight project tends to implement architecture-as-code definition of a standard c4 architecture model. 
                        This project offers a new Insight language designed in such way that an Architect can focus on architecture 
                        definition, not visualization.
                        <br>
                        Compared to UML, the Insight language is more specific and is unable to describe 
                        an arbitrary entity, but shorter and probably easier to use.
                        <br>
                        Unlike other UML software, such as PlantUML, Archinsight would offer it's user:
                        <ul>
                          <li>A specific Insight language to describe c4 model</li>
                          <li>Model integrity check with linker</li>
                          <li>Model interactivity</li>
                          <li>Architecture introspections from highest to lowest level in one place</li>
                        </ul>
                        """);
        // first line actions ==========================================================================================
        var actionsFirstLine = new HorizontalLayout();
        actionsFirstLine.setMargin(false);
        var dockerhub = createTile(150, "Dockerhub", "static/docker-svgrepo-com.svg", "#0db7ed");
        dockerhub.getElement().setAttribute("router-ignore", true);
        dockerhub.setClassName("tile_action");
        dockerhub.addClickListener(e -> {
            getElement().executeJs("window.open('https://hub.docker.com/r/lonelylockley/archinsight', '_blank')");
        });
        var github = createTile(150, "Project Github", "static/github-142-svgrepo-com.svg", "#171515");
        github.getElement().setAttribute("router-ignore", true);
        github.setClassName("tile_action");
        github.addClickListener(e -> {
            getElement().executeJs("window.open('https://github.com/lonely-lockley/archinsight', '_blank')");
        });
        var playground = createTile(150, "Playground", "static/playground-svgrepo-com.svg", "#04AA6D");
        playground.setClassName("tile_action");
        playground.addClickListener(e -> {
            UI.getCurrent().navigate(PlaygroundView.class);
        });
        actionsFirstLine.add(dockerhub);
        actionsFirstLine.add(github);
        actionsFirstLine.add(playground);
        // second line actions =========================================================================================
        var actionsSecondLine = new HorizontalLayout();
        actionsSecondLine.setMargin(false);
        var login = createTile(317, 150, "Sign in with Google", "static/google-178-svgrepo-com.svg", "#ff4e50");
        login.addClickListener(e -> {
            getElement().executeJs(String.format("window.open('%s/oauth/login/google', '')", System.getenv("IDENTITY")));
        });
        login.getElement().setAttribute("router-ignore", true);
        login.setClassName("tile_action");
        var ilang = createTile(150, "Insight language", "static/language-json-svgrepo-com.svg", "#a7226e");
        ilang.getElement().setAttribute("router-ignore", true);
        ilang.setClassName("tile_action");
        ilang.addClickListener(e -> {
            getElement().executeJs("window.open('https://github.com/lonely-lockley/archinsight/wiki/Insight-language', '_blank')");
        });
        actionsSecondLine.add(login);
        actionsSecondLine.add(ilang);
        // third line actions ==========================================================================================
        var actionsThirdLine = new HorizontalLayout();
        actionsThirdLine.setMargin(false);
        var mailto = createTile(150, "Contact us", "static/mail-pencil-svgrepo-com.svg", "#f9d423");
        mailto.getElement().setAttribute("router-ignore", true);
        mailto.setClassName("tile_action");
        mailto.addClickListener(e -> {
            getElement().executeJs("window.open('mailto:webmaster@archinsight.org', '')");
        });
        actionsThirdLine.add(mailto);
        if ("true".equalsIgnoreCase(System.getenv("DEV_MODE"))) {
            var devLogin = createTile(317, 150, "Test Login", "static/user-check-svgrepo-com.svg", "#ffffff");
            devLogin.getElement().getStyle().set("color", "#000000");
            devLogin.addClickListener(e -> {
                getElement().executeJs(String.format("window.open('%s/auth/testOk', '')", System.getenv("IDENTITY")));
            });
            devLogin.setClassName("tile_action");
            actionsThirdLine.add(devLogin);
        }
        // get thing done finally ======================================================================================
        var right = new VerticalLayout();
        right.setMargin(false);
        right.add(actionsFirstLine);
        right.add(actionsSecondLine);
        right.add(actionsThirdLine);
        content.add(bg);
        content.add(contentSplit(783, lb, right));
        return content;
    }

    private VerticalLayout createTile(float width, float height, String text, String iconSrc, String color) {
        var res = new VerticalLayout();
        res.setMargin(false);
        res.setPadding(false);
        res.setAlignItems(Alignment.CENTER);
        res.setWidth(width, Unit.PIXELS);
        res.setHeight(height, Unit.PIXELS);
        res.getElement().getStyle().set("padding-top", (height * 0.12) + "px");
        var icon = new Image(iconSrc, "-");
        var smaller = Math.min(width, height);
        icon.setWidth(smaller * 0.5f, Unit.PIXELS);
        icon.setHeight(smaller * 0.5f, Unit.PIXELS);
        res.add(icon);
        var txt = new Label(text);
        res.add(txt);
        res.getElement().getStyle().set("background-color", color);
        return res;
    }

    private VerticalLayout createTile(float size, String text, String iconSrc, String color) {
        return createTile(size, size, text, iconSrc, color);
    }

    private HorizontalLayout contentSplit(float leftWidth, Component left, Component right) {
        var dl = new Div();
        dl.setWidth(leftWidth, Unit.PIXELS);
        dl.add(left);
        var dr = new Div();
        dr.setWidth(100, Unit.PERCENTAGE);
        dr.add(right);
        var res = new HorizontalLayout();
        res.add(dl);
        res.add(dr);
        return res;
    }

    private FlexLayout createGreeting() {
        var layout = new FlexLayout();
        layout.setAlignItems(Alignment.END);
        var greeting = new Div();
        greeting.add(new Label("Archinsight"));
        greeting.getElement().getStyle().set("font-size", "58px");
        greeting.getElement().getStyle().set("margin-top", "150px");
        greeting.getElement().getStyle().set("margin-left", "50px");
        layout.add(greeting);
        return layout;
    }

    @Override
    public void setParameter(BeforeEvent event, @OptionalParameter String parameter) {
        var location = event.getLocation();
        UI.getCurrent().navigate(parameter);
    }
}
