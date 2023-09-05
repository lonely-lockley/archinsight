// interface LinkerMessage {
//     level: string,
//     msg: string,
//     line: number,
//     charPosition: number
//     startIndex: number
//     stopIndex: number
// }
//
// interface TranslatedSource {
//     source: string,
//     messages: LinkerMessage[]
// }

class Renderer {

    public remoteRender(container: HTMLElement, code: string) {
        (container as any).$server.render(code);
    }
}

export default Renderer;