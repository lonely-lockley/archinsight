function loginCallback() {
    // sends fake heartbeat to deliver auth cookie to backend after login sequence completion
    // after that triggers loginCallback method on server side. this is needed to authenticate
    // user in case of working via websocket
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var container = document.getElementById('content-presentation');
            container.$server.loginCallback();
        }
    }
    let uiid = Object.values(Vaadin.Flow.clients)
                     .filter(client => client.getUIId && typeof client.getUIId() === 'number')
                     .map(client => client.getUIId())
                     .find(id => id !== undefined);
    if (uiid !== undefined) {
        xhr.open("POST", window.frontendSettings.contextPath + "/?v-r=heartbeat&v-uiId=" + uiid);
        xhr.send();
    }
}

window.loginCallback = loginCallback
