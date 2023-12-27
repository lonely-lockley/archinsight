class Renderer {

    public remoteRender(container: HTMLElement, code: string) {
        this.digestMessage(code).then((digest) => (container as any).$server.render(digest, code));
    }

    public remoteCache(container: HTMLElement, code: string) {
        this.digestMessage(code).then((digest) => (container as any).$server.cache(digest, code));
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