class Renderer {

    public remoteRender(container: HTMLElement, tab: string, code: string, darkMode: boolean) {
        this.digestMessage(code).then((digest) => (container as any).$server.render(digest, tab, code, darkMode));
    }

    public remoteCache(container: HTMLElement, tab: string, code: string) {
        this.digestMessage(code).then((digest) => (container as any).$server.cache(digest, tab, code));
    }

    private async digestMessage(message: string): Promise<string> {
        const msgUint8 = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        return hashHex;
    }
}

export default Renderer;
