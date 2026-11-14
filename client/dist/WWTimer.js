var interval = 10;
var lastTime = Date.now();

function tick() {
    var currentTime = Date.now();
    var deltaTime = currentTime - lastTime;

    postMessage(deltaTime);

    lastTime = currentTime;
    setTimeout(tick, interval);
}

tick();