
class LinkerMessage {
    level?: string;
    msg?: string;

    charPosition: number = 0;
    startIndex: number = 0;
    stopIndex: number = 0;
    line: number = 0;
}

class TranslatorResponse {
    source?: string;
    messages?: LinkerMessage[];
}

export default TranslatorResponse;