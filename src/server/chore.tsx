import Feature from "./feature"

export default class Chore {
    title : string;
    details : string;
    feature : Feature;
    createdAt : Date;
    updatedAt : Date;

    constructor(title : string, details : string, feature : Feature) {
        this.title = title;
        this.details = details;
        this.feature = feature;
        this.createdAt = new Date();
    }

    updateDetails(newDetails : string) {
        this.details = newDetails
        this.updatedAt = new Date();
    }

    getDateString() {
        return this.createdAt.toUTCString()
    }
}
