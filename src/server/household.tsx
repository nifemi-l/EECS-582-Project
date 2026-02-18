import User from "./user" 
import Sensors from "./sensors"

export default class Household {
    title : string
    users : string[] 
    adminUsers: User[]
    sensors : Sensors

    constructor(title, users) {
        this.title = title;
        this.users = users;
    }
}
