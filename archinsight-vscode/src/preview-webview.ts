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

      .error {
        margin: 16px;
        padding: 12px;
        border: 1px solid var(--vscode-inputValidation-errorBorder);
        border-radius: 4px;
        background: var(--vscode-inputValidation-errorBackground);
        color: var(--vscode-inputValidation-errorForeground);
        white-space: pre-wrap;
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
          preview.innerHTML = "";
          const error = document.createElement("section");
          error.className = "error";
          error.textContent = state.error;
          preview.append(error);
          return;
        }
        preview.innerHTML = state?.svg ?? "";
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
