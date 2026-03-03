/* PROLOGUE
File name: frequency.tsx
Description: Class for a task's requency, allowing for dynamic behavior scheduling repeated tasks
Programmer: Delroy Wright
Creation date: 2/19/26
Revision date: 
Preconditions: A client is running and has access to the Task class and any inherited members.
Postconditions: An instantiated Frequency class along with any functions that are required.
Errors: Frequencies may be attempted to be created with invalid data or fields.
Side effects: None
Invariants: None
Known faults: None
*/

export abstract class Frequency {
    timesPerInterval : number;
    days : number;
    constructor() {
        this.timesPerInterval = 1;
    }

    abstract checkOverdue(lastCompletedTime : Date): boolean;

    protected getMsSinceLastComplete(lastCompletedTime : Date): number {
        const now = new Date();
        if (now <= lastCompletedTime) return 0;
        return Math.abs(lastCompletedTime.getTime() - now.getTime());
    }
}

// Type of frequency - A certain amount of days in between
export class DayAmount extends Frequency {
    constructor(
        public days: number,
    ) {
        super();
        this.days = days;
    }

    getDecay(dueDate: Date): number {
        const msSince = this.getMsSinceLastComplete(dueDate);
        const daysSince = Math.floor(msSince / 86400000);
        const intervalsSince = Math.floor(daysSince / this.days);

        return intervalsSince * this.timesPerInterval;
    }

    checkOverdue(lastCompletedTime: Date): boolean {
        const msSinceLastComplete = this.getMsSinceLastComplete(lastCompletedTime);
        if (msSinceLastComplete > this.days * 86400000){
            return true
        }
        return false
    }
}

// Type of frequency - Once per month, once per year. Varies differently than things like weekly
export class SetInterval extends Frequency {
    constructor(
        public interval: Interval,
    ) {
        super();
        this.timesPerInterval = 1;
    }

    getDecay(dueDate: Date): number {
        const msSince = this.getMsSinceLastComplete(dueDate);
        const intervalMs = getIntervalMillis(this.interval);
        const intervalsSince = Math.floor(msSince / intervalMs);

        return intervalsSince * this.timesPerInterval;
    }

    checkOverdue(lastCompletedTime: Date): boolean {
        const msSince = this.getMsSinceLastComplete(lastCompletedTime);
        const intervalMs = getIntervalMillis(this.interval);
        const intervalsSince = Math.floor(msSince / intervalMs);
        return intervalsSince > 0;
    }
}

export enum Interval {
    Monthly,
    Yearly,
}

export enum Weekday {
    Monday,
    Tuesday,
    Wednesday,
    Thursday,
    Friday,
    Saturday,
    Sunday,
}

function getMillisUntilNextMonth(): number {
    const now = new Date();
    const target = new Date(now.getTime());

    target.setMonth(now.getMonth() + 1);

    if (target.getMonth() > (now.getMonth() + 1) % 12) {
        target.setDate(0);
    }

    return target.getTime() - now.getTime();
}

function getMillisUntilNextYear(): number {
    const now = new Date();
    const target = new Date(now.getTime());

    target.setFullYear(now.getFullYear() + 1);

    return target.getTime() - now.getTime();
}

function getMillisSinceLastMonth(): number {
    const now = new Date();
    const lastMonth = new Date(now.getTime());

    lastMonth.setMonth(now.getMonth() - 1);

    if (lastMonth.getMonth() === now.getMonth()) {
        lastMonth.setDate(0);
    }

    return now.getTime() - lastMonth.getTime();
}

function getMillisSinceLastYear(): number {
    const now = new Date();
    const lastYear = new Date(now.getTime());

    lastYear.setFullYear(now.getFullYear() - 1);

    return now.getTime() - lastYear.getTime();
}

const getIntervalMillis = (interval: Interval): number => {
    switch (interval) {
        case Interval.Monthly:
            return getMillisSinceLastMonth();
        case Interval.Yearly:
            return getMillisSinceLastYear();
        default:
            return 0;
    }
};
