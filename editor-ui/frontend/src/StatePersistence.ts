class Tab {
    name: string = '<New File>';
    fid?: string;
    code?: string;
}

class TabState {

    private tabs: Map<string, Tab> = new Map();
    private currentContext?: string;

    private checkContext(key: string) {
        if (typeof this.currentContext === 'undefined') {
            this.currentContext = key;
        }
        else
        if (this.currentContext === key) {
            return;
        }
        else {
            this.tabs = new Map();
            this.currentContext = key;
        }
    }

    public storeTab(key: string, tid: string, name?: string, fid?: string) {
        this.checkContext(key);
        var tmp: Tab;
        if (!this.tabs.has(tid)) {
            tmp = new Tab();
            this.tabs.set(tid, tmp);
        }
        else {
            tmp = this.tabs.get(tid)!;
        }
        if (typeof name !== 'undefined') {
            tmp.name = name;
        }
        if (typeof fid !== 'undefined') {
            tmp.fid = fid;
        }
        localStorage.setItem(key, JSON.stringify(Object.fromEntries(this.tabs)));
    }

    public storeCodeForTab(key: string, tid: string, code?: string) {
        this.checkContext(key);
        if (this.tabs.has(tid)) {
            var tmp = this.tabs.get(tid)!;
            tmp.code = code || '';
        }
        localStorage.setItem(key, JSON.stringify(Object.fromEntries(this.tabs)));
    }

    public restoreCodeForTab(key: string, tid: string): string | undefined {
        var tmp: Map<string, Tab> = new Map(Object.entries(JSON.parse(localStorage.getItem(key) || '{}')));
        if (tmp.has(tid)) {
            return tmp.get(tid)!.code;
        }
        else {
            return;
        }
    }

    public removeTab(key: string, tid: string) {
        this.checkContext(key);
        this.tabs.delete(tid);
        localStorage.setItem(key, JSON.stringify(Object.fromEntries(this.tabs)));
    }

    public restoreTabs(key: string): string {
        return localStorage.getItem(key) || '{}';
    }
}

(window as any).tabState = new TabState()