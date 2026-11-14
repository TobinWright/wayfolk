import { S2C } from "../constants/Routes";

export class Utils {

    public static getEnumCount(enumerator: any) {
        return Object.keys(enumerator).length / 2;
    }

    public static clamp(num: number, min: number, max: number) {
        return Math.min(Math.max(num, min), max);
    }

    public static removeDuplicates(arr: any) {
        return arr.filter((v: number, i: number) => arr.indexOf(v) === i);
    }

    public static base64ToUint8Array(base64: string) {
        var binaryString = window.atob(base64);
        var bytes = new Uint8Array(binaryString.length);
        for (var i = 0; i < binaryString.length; i++)
            bytes[i] = binaryString.charCodeAt(i);
        return bytes;
    }

    public static uint8ToUint32(uint8: any) {
        const uint32 = new Uint32Array(uint8.length / 4);
        const dv = new DataView(uint8.buffer);
        for (let i = 0; i < uint32.length; i++) {
            const index = i * 4;
            uint32[i] = dv.getUint32(index, true);
        }
        return uint32;
    }

    public static getTimeUntilExpiry(timestamp: number) {
        let seconds = timestamp - Math.floor(new Date().getTime() / 1000);
        let days = Math.floor(seconds / 86400);
        seconds -= days * 86400;
        let hours = Math.floor(seconds / 3600);
        seconds -= hours * 3600;
        let minutes = Math.floor(seconds / 60);
        seconds -= minutes * 60;
        seconds = Math.floor(seconds);
        return [days, hours, minutes, seconds];
    }

    public static getTimeArray(seconds: number) {
        let hours = Math.floor(seconds / 3600);
        seconds -= hours * 3600;
        let minutes = Math.floor(seconds / 60);
        seconds -= minutes * 60;
        seconds = Math.floor(seconds);
        return [hours, minutes, seconds];
    }

    public static getFormattedPlaytime(playtime: number) {
        let timeArray = Utils.getTimeArray(playtime);

        let hours = Utils.formatWithZeroes(timeArray[0].toString(), 2);
        let minutes = Utils.formatWithZeroes(timeArray[1].toString(), 2);
        let seconds = Utils.formatWithZeroes(timeArray[2].toString(), 2);

        return hours + " : " + minutes + " : " + seconds;
    }

    public static formatWithZeroes(initialString: string, minimumLength: number) {
        let numOfZeroes = minimumLength - initialString.length;
        for (let i = 0; i < numOfZeroes; i++)
            initialString = "0" + initialString;
        return initialString;
    }

    public static getParams(url: string) {
        let params: any = {};
        let parser = document.createElement('a');
        parser.href = url;
        let query = parser.search.substring(1);
        let vars = query.split('&');
        for (let i = 0; i < vars.length; i++) {
            let pair = vars[i].split('=');
            params[pair[0]] = decodeURIComponent(pair[1]);
        }
        return params;
    }

    public static logMessage(message: any) {
        let ignore: any = [];

        let found = false;
        for (let i = 0; i < ignore.length; i++)
            if (ignore[i] == message.r)
                found = true;
        if (found) return;

        console.log("");
        console.log("=================================================================");
        console.log("Received Message: " + S2C[message.r]);
        console.log(message);
        console.log("=================================================================");
        console.log("");
    }

}