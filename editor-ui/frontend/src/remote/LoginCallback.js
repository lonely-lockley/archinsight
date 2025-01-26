function loginCallback() {
    // sends fake heartbeat to deliver auth cookie to backend after login sequence completion
    // after that triggers loginCallback method on server side. this is needed to authenticate
    // user in case of working via websocket
    fetch(window.frontendSettings.contextPath + "/loginComplete", {
        method: "GET"
    })
    .then(response => {
        if (response.ok) {
            var container = document.getElementById('content-presentation');
            container.$server.loginCallback();
        }
        else {
            console.error('Error performing request: ', response.statusText);
        }
    })
    .catch(error => {
        console.error('Could not finish login callback sequence: ', error);
    });
}

function logoutFlow() {
    fetch("/auth/logout", {
        method: "GET"
    })
    .then(response => {
        if (response.ok) {
            window.location.reload();
        }
        else {
            console.error('Error performing request: ', response.statusText);
        }
    })
    .catch(error => {
        console.error('Could not finish login callback sequence: ', error);
    });
}

window.loginCallback = loginCallback
window.logoutFlow = logoutFlow
