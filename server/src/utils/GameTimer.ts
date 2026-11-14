export class GameTimer {

	private callback: CallableFunction;
	private interval: number;
	private lastTime: number;

	constructor(callback: CallableFunction) {
		this.callback = callback;
		this.interval = 200;
		this.lastTime = Date.now();

		this.tick();
	}

	// (the next tick set first: a throw in the callback can't stop the loop)
	tick() {
		setTimeout(this.tick.bind(this), this.interval);
		var currentTime = Date.now();
		var deltaTime = currentTime - this.lastTime;
		this.lastTime = currentTime;
		this.callback(deltaTime);
	}

}
