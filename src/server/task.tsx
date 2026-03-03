/* PROLOGUE
File name: task.tsx
Description: Class for a task attached to a particualr location.
Programmer: Delroy Wright
Creation date: 2/13/26
Revision date: 
  - 2/16/26: update fields, add createdAt and updatedAt
  - 2/18/26: Rename variables, update feature field to be Feature type
  - 1/20/26: started work on decay rate and task mgmnt
Preconditions: A client is running and has access to the Task class and any inherited members.
Postconditions: An instantiated feature class along with any functions that are required.
Errors: Tasks may be attempted to be created with invalid data or fields.
Side effects: None
Invariants: None
Known faults: None
*/

import Feature from "./feature";
import User from "./user";
import { Frequency, DayAmount, SetInterval, Interval } from "./frequency";

export enum TaskVisibility {
    Private,
    Household,
}

export default class Task {
    id: string; // TODO: get from database
    name: string;
    feature: Feature;
    lastCompleted: Date;
    frequency: Frequency;
    taskCreatedBy: User;
    visibility: TaskVisibility;
    healthPercent: number;
    icon: string; // MaterialCommunityIcons icon name

    constructor(
        id: string,
        name: string,
        frequencyDays: number,
        lastCompleted: Date,
        icon: string,
        visibility?: string,
    ) {
        this.id = id;
        this.name = name;
        // this.taskCreatedBy = taskCreatedBy;
        this.icon = icon;

        this.visibility = ((): TaskVisibility => {
            if (!visibility) {
                return TaskVisibility.Private;
            }
            if (visibility.toLowerCase() == "private") {
                return TaskVisibility.Private;
            } else if (visibility.toLowerCase() == "household") {
                return TaskVisibility.Household;
            }
            throw new Error(`Invalid visibility: "${visibility}"`);
        })();

        this.frequency = new DayAmount(frequencyDays);
    }

    setFrequency(interval: string, dayAmount: number) {
        if (
            (interval == null && dayAmount == null) ||
            (interval != null && dayAmount != null)
        ) {
            throw Error(
                "Cannot create a frequency that is both a variable interval (EX: monthly) and a set amount of days (EX: weekly)",
            );
        }

        if (dayAmount != null) {
            this.frequency = new DayAmount(dayAmount);
        }

        if (interval != null) {
            let tgtInterval: any = null;
            if (interval == "monthly") tgtInterval = Interval.Monthly;
            else if (interval == "yearly") tgtInterval = Interval.Yearly;

            this.frequency = new SetInterval(tgtInterval);
        }
    }

    // Updates and returns healthpercent for a task
    getAndSetHealthPercent() {
        const now = Date.now(); // current time in ms
        const last = this.lastCompleted.getTime(); // last completion in ms
        const windowMs = this.frequency.days * 24 * 60 * 60 * 1000; // convert frequency to ms
        const elapsed = now - last; // how long since it was last done
        this.healthPercent = Math.max(0, Math.min(1, 1 - elapsed / windowMs)); // clamp between 0 and 1
        return Math.max(0, Math.min(1, 1 - elapsed / windowMs)); // clamp between 0 and 1
    }

    // Pick a color based on the health percentage
    // Green if healthy, orange if getting stale, red if overdue
    getHealthColor(percent: number): string {
        if (percent >= 0.6) return "#4caf50"; // green for healthy
        if (percent >= 0.3) return "#ff9800"; // orange for mid-range
        return "#f44336"; // red for overdue
    }

    getTzTimestamp(date: Date) {
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

    finishTask() {
        this.lastCompleted = new Date();
    }
}
