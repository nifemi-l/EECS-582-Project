/* PROLOGUE
File name: chore.tsx
Description: Class for a chore attached to a particualr location.
Programmer: Delroy Wright
Creation date: 2/13/26
Revision date: 
  - 2/16/26: update fields, add createdAt and updatedAt
  - 2/18/26: Rename variables, update feature field to be Feature type
  - 1/20/26: started work on decay rate and chore mgmnt
Preconditions: A client is running and has access to the Chore class and any inherited members.
Postconditions: An instantiated feature class along with any functions that are required.
Errors: Chores may be attempted to be created with invalid data or fields.
Side effects: None
Invariants: None
Known faults: None
*/
import Feature from "./feature"
import { Frequency, DayAmount, SetInterval, Interval } from "./frequency"

export default class Chore {
    title : string;
    details : string;
    feature : Feature;
    createdAt : Date;
    lastFinishedChoreTime : Date;
    dueDate : Date;
    frequency: Frequency; 
    decayRate: number;
    healthPercent : number;

    constructor(title : string, details : string, feature : Feature) {
        this.title = title;
        this.details = details;
        this.feature = feature;
        this.createdAt = new Date();
        
        this.decayRate = 1 // 1% for every time missed on their set interval?
    }

    setFrequency(timesPerInterval : number, skipIntervals : number, resetOnCompletion : boolean, interval : string, dayAmount : number  ) {
        if (interval == null && dayAmount == null || interval != null && dayAmount != null) {
            throw Error("Cannot create a frequency that is both a variable interval (EX: monthly) and a set amount of days (EX: weekly)")
        }

        if (dayAmount != null) {
            this.frequency = new DayAmount(timesPerInterval, skipIntervals, resetOnCompletion, dayAmount)
        }

        if (interval != null) {
            let tgtInterval : any = null
            if (interval == "monthly")
                tgtInterval = Interval.Monthly
            else if (interval == "yearly")
                tgtInterval = Interval.Yearly

            this.frequency = new SetInterval(timesPerInterval, skipIntervals, tgtInterval)
        }
    }

    updateDetails(newDetails : string) {
        this.details = newDetails
    }

    getDateString() {
        return this.createdAt.toUTCString()
    }

    decayChore() {
        this.healthPercent -= this.frequency.getDecay(this.dueDate) 
    }

    finishChore() { 
        let now = new Date()
        this.lastFinishedChoreTime = now
        this.dueDate = this.frequency.updateDueDate(this.dueDate, now)

    }


}
