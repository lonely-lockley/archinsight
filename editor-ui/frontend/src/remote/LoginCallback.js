function loginCallback() {
    // sends fake heartbeat to deliver auth cookie to backend after login sequence completion
    // after that triggers loginCallback method on server side
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4 && xhr.status == 200) {
            var container = document.getElementById('content-presentation');
            container.$server.loginCallback();
        }
    }
    xhr.open("POST", "/?v-r=heartbeat&v-uiId=" + Vaadin.Flow.clients.ROOT.getUIId());
    xhr.send();
}

window.loginCallback = loginCallback
