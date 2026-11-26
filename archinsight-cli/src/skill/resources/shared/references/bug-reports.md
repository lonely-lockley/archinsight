# Reporting Archinsight bugs

Draft the report locally. Give each independent finding a short ID and a title that names the trigger and the visible failure. Keep the ID when retesting a new release. Findings can share one synthetic fixture.

## Toolchain and platform

Start every report with these two fields for each setup tested. If a value cannot be determined, mark it as unknown.

- **Toolchain versions.** For CLI runs, record the output of `archinsight --version` (including any preview suffix) and `node --version`. For VS Code, record the editor and Archinsight extension versions. For web, record the Archinsight web build and browser version. Include the generated skill version when the finding concerns its instructions.
- **Platform.** Record the OS name, OS version and CPU architecture of the environment where the affected tool ran. For a remote extension host or container, identify that environment. Omit hostnames and machine identifiers.

## What to record

- **Expected and observed behavior.** State what the user was trying to do, the first step that gives a wrong result, and its impact. Ground the expectation in a documented rule, a previous working version, or a passing control. If the intended behavior is unclear, record the open question. Label any suspected cause as a hypothesis.
- **Scope.** Identify the source tab, view, selected environment and any query override using synthetic names. Include the last known working version if someone tested it.
- **Project scale.** Give aggregate counts for the affected project and list the smaller repro's counts separately. Start with Insight files, elements and relationships. Add the dimensions that change the outcome, such as services, environments per service, projected edges, or elements selected by the tab. Mark unavailable counts as unknown.
- **Evidence.** Quote the smallest decisive observation: a diagnostic code and location, a missing or extra edge with its direction and placement, an exit status, or the difference between two query results. For an AIQ limit, record which limit fired, its value, and measured expansions if available. A limit hit gives a lower bound. For a scaling claim, show the same query at several sizes and identify the first tested failure. Record link, query and render timings separately when measured.

## Build and verify a shareable repro

Create the smallest standalone project that still fails, using invented names and data from the start. Keep only the declarations, file boundaries, routes and relationships that influence the result. Supply the relative file tree and complete file contents, or a deterministic generator for a scale-dependent failure. Include the exact commands from the fixture root or the equivalent UI actions.

Run the sanitized fixture in a fresh directory on the reported version. For stateful failures, specify the initial state, seed the cache there, show the exact edit and rerun, and compare with a cold run on the same edited sources. Record how often it reproduced. If only the working project fails, report the original observation and the unsuccessful reduction explicitly.

Review the entire draft and every attachment, including filenames, comments, diagnostics, screenshots and generated output. Use synthetic identifiers and relative paths throughout. Exclude internal source, service and customer names, private URLs, account identifiers, credentials, caches and raw project exports.

## Make the scope of verification explicit

For each finding, list the cases that **failed**, the controls that **passed**, and the relevant cases **not tested**. A CLI observation alone leaves web and VS Code untested. For example, a warm CLI query may lose an edge after an edit while a cold query returns it. Record both results, the edge that distinguishes them, and whether rendering was checked. Include a workaround only if verified. A proposed fix should say which repro and control would verify it.

## GitHub publication

Show the user the exact title, body and attachments intended for the issue in the [Archinsight repository](https://github.com/lonely-lockley/archinsight). Create the issue only after the user explicitly approves publishing that draft to that repository. A request to investigate or prepare a report authorizes a local draft. If its public contents change after approval, obtain approval for the revised draft.
