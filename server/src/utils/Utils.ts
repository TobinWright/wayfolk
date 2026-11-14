export class Utils {

	public static getActiveUntil() {
		const now = new Date();
		return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
	}

	public static randomIndex(arrayLength: number) {
		return Math.floor(Math.random() * arrayLength);
	}

	// min and max included 
	public static randomInt(min: number, max: number) {
		return Math.floor(Math.random() * (max - min + 1) + min);
	}

	public static randomBool() {
		return this.randomInt(0, 1) == 0;
	}

	public static shuffleArray(array: any[]) {
		for (var i = array.length - 1; i > 0; i--) {
			var j = Math.floor(Math.random() * (i + 1));
			var temp = array[i];
			array[i] = array[j];
			array[j] = temp;
		}
	}

	public static getTimestamp() {
		var shortener = 1606779023;
		return Math.floor(Date.now() / 1000) - shortener;
	}

}