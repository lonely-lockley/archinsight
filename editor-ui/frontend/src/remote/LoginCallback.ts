function loginCallback() {
    const container: HTMLElement = document.getElementById('content-presentation')!;
    (container as any).$server.loginCallback();
}

((window) as any).loginCallback = loginCallback
