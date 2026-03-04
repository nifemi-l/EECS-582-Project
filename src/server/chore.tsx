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
import User from "./user"
import { Frequency, DayAmountFrequency, SetIntervalFrequency, Interval } from "./frequency"

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
    choreOwner : User;
    privateChore : boolean;

    constructor(title : string, details : string, feature : Feature, choreOwner : User, privateChore : boolean) {
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
            this.frequency = new DayAmountFrequency(timesPerInterval, skipIntervals, resetOnCompletion, dayAmount)
        }

        if (interval != null) {
            let tgtInterval : any = null
            if (interval == "monthly")
                tgtInterval = Interval.Monthly
            else if (interval == "yearly")
                tgtInterval = Interval.Yearly

            this.frequency = new SetIntervalFrequency(timesPerInterval, skipIntervals, tgtInterval)
        }
    }

    updateDetails(newDetails : string) {
        this.details = newDetails
    }

    getTzTimestamp(date : Date) {
      const pad = (n) => String(n).padStart(2, "0");

      const year = date.getFullYear();
      const month = pad(date.getMonth() + 1);
      const day = pad(date.getDate());
      const hours = pad(date.getHours());
      const minutes = pad(date.getMinutes());
      const seconds = pad(date.getSeconds());
      const millis = String(date.getMilliseconds()).padStart(3, "0");

      const offsetMinutes = -date.getTimezoneOffset();
      const sign = offsetMinutes >= 0 ? "+" : "-";
      const absOffset = Math.abs(offsetMinutes);
      const offsetHours = pad(Math.floor(absOffset / 60));
      const offsetMins = pad(absOffset % 60);

      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${millis}${sign}${offsetHours}:${offsetMins}`;
    }


    public decayChore() {
        this.healthPercent -= this.frequency.getDecay(this.dueDate) 
    }

    finishChore() { 
        let now = new Date()
        this.lastFinishedChoreTime = now
        this.dueDate = this.frequency.updateDueDate(this.dueDate, now)

    }
}
