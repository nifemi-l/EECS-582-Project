/* PROLOGUE
File name: chore.tsx
Description: Class for a chore attached to a particualr location.
Programmer: Delroy Wright
Creation date: 2/13/26
Revision date: 
  - 2/16/26: update fields, add createdAt and updatedAt
  - 2/18/26: Rename variables, update feature field to be Feature type
Preconditions: A client is running and has access to the Chore class and any inherited members.
Postconditions: An instantiated feature class along with any functions that are required.
Errors: Chores may be attempted to be created with invalid data or fields.
Side effects: None
Invariants: None
Known faults: None
*/
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
