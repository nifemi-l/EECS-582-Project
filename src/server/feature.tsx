import User from "./user"

export default class Feature {
    title : string;
    createdBy : User;
    accessList : User[];
    constructor(title : string, createdBy : User) {
        this.title = title;
        this.createdBy = createdBy;
        this.accessList = [createdBy];
    }
}
