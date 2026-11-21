export function previewHtml(): string {
  const nonce = webviewNonce();
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <style>
      body {
        min-width: 0;
        height: 100vh;
        margin: 0;
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        font-family: var(--vscode-font-family);
      }

      .preview {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        box-sizing: border-box;
        overflow: auto;
        padding: 16px;
      }

      .preview svg {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 0 auto;
      }

      .notice {
        display: grid;
        align-content: center;
        justify-items: center;
        max-width: 420px;
        min-height: calc(100vh - 32px);
        margin: auto;
        text-align: center;
      }

      .notice strong {
        font-size: 15px;
        font-weight: 600;
        line-height: 1.4;
      }

      .notice p {
        margin: 7px 0 0;
        color: var(--vscode-descriptionForeground);
        font-size: 13px;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main id="preview" class="preview"></main>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const preview = document.getElementById("preview");
      let state;

      window.addEventListener("message", (event) => {
        if (event.data?.command === "preview") {
          state = event.data.state;
          render();
          return;
        }
        if (event.data?.command === "exportPng") {
          void exportPng(event.data.svg);
        }
      });

      function render() {
        if (state?.error !== undefined) {
          if (preview.childElementCount === 0 && state.diagramNotice !== undefined) renderNotice(state.diagramNotice);
          return;
        }
        if (state?.diagramNotice !== undefined) {
          renderNotice(state.diagramNotice);
          return;
        }
        renderTrustedSvg(state?.svg);
      }

      function renderNotice(notice) {
        preview.replaceChildren();
        const section = document.createElement("section");
        section.className = "notice";
        section.setAttribute("role", "status");
        const title = document.createElement("strong");
        title.textContent = notice.title;
        const detail = document.createElement("p");
        detail.textContent = notice.detail;
        section.append(title, detail);
        preview.append(section);
      }

      function renderTrustedSvg(rawSvg) {
        preview.replaceChildren();
        if (typeof rawSvg !== "string") return;
        const parsed = new DOMParser().parseFromString(rawSvg, "image/svg+xml");
        const root = parsed.documentElement;
        if (parsed.querySelector("parsererror") !== null || root.nodeName.toLowerCase() !== "svg") return;
        for (const unsafe of root.querySelectorAll("script, foreignObject, iframe, object, embed, style")) unsafe.remove();
        for (const element of [root, ...root.querySelectorAll("*")]) {
          for (const attribute of [...element.attributes]) {
            const name = attribute.name.toLowerCase();
            const value = attribute.value.trim();
            if (name.startsWith("on") || name === "style"
                || ((name === "href" || name === "xlink:href")
                  && !value.startsWith("#") && !value.startsWith("insight://goto?"))) {
              element.removeAttribute(attribute.name);
            }
          }
        }
        preview.append(document.importNode(root, true));
      }

      async function exportPng(svg) {
        const image = new Image();
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || 1;
        canvas.height = image.naturalHeight || 1;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL("image/png");
        vscode.postMessage({ command: "png", dataUrl });
      }

      vscode.postMessage({ command: "ready" });
    </script>
  </body>
</html>`;
}

function webviewNonce(): string {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
}
