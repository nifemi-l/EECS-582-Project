/* PROLOGUE
File name: household.tsx
Description: Class for a household containing chores, users, and features.
Programmer: Delroy Wright
Creation date: 2/13/26
Revision date: 
  - 2/16/26: update fields, add adminUsers, sensors, and features
  - 2/18/26: Rename variables, update feature field to be Feature type, sensor field to be Sensor type
Preconditions: A client is running and has access to the Sensor class and any inherited members.
Postconditions: An instantiated household class along with any functions that are required.
Errors: Households may be attempted to be created with invalid data or fields.
Side effects: None
Invariants: None
Known faults: None
*/
import User from "./user" 
import Sensors from "./sensors"
import Feature from "./feature"

export default class Household {
    title : string
    users : string[] 
    adminUsers: User[]
    sensors : Sensors
    features : Feature[]
    // location : Location ?? 

    constructor(title, users) {
        this.title = title;
        this.users = users;
    }
}
