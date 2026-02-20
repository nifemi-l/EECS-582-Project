/* PROLOGUE
File name: frequency.tsx
Description: Class for a chore's requency, allowing for dynamic behavior scheduling repeated chores
Programmer: Delroy Wright
Creation date: 2/19/26
Revision date: 
Preconditions: A client is running and has access to the Chore class and any inherited members.
Postconditions: An instantiated Frequency class along with any functions that are required.
Errors: Frequencies may be attempted to be created with invalid data or fields.
Side effects: None
Invariants: None
Known faults: None
*/

export abstract class Frequency {
    constructor(
        public timesPerInterval: number,
        public skipIntervals: number,
    ) { }

    abstract getDecay(Date): number;
    abstract updateDueDate(dueDate: Date, now: Date): Date;

    protected getMsSinceDue(dueDate: Date): number {
        const now = new Date();
        if (now <= dueDate) return 0;
        return Math.abs(dueDate.getTime() - now.getTime());
    }

}

// Type of frequency - A certain amount of days in between 
export class DayAmount extends Frequency {
    constructor(
        timesPerInterval: number, skipIntervals: number, public resetOnCompletion: boolean,
        public numDays: number
    ) {
        super(timesPerInterval, skipIntervals);
    }

    getDecay(dueDate: Date): number {
        const msSince = this.getMsSinceDue(dueDate);
        const daysSince = Math.floor(msSince / 86400000);
        const intervalsSince = Math.floor(daysSince / this.numDays);

        if (intervalsSince > this.skipIntervals) return 0;
        return intervalsSince * this.timesPerInterval;
    }

    updateDueDate(dueDate: Date, now: Date): Date {
        if (this.resetOnCompletion) {
            const daysToAdd = this.numDays
            const msToAdd = daysToAdd * 86400000
            return new Date(now.getTime() + msToAdd)
        }

        else {
            const daysToAdd = this.numDays + Math.floor(Math.abs(now.getTime() - dueDate.getTime()) / 86400000)
            return new Date(now.getTime() + daysToAdd)
        }
    }
}

// Type of frequency - Once per month, once per year. Varies differently than things like weekly
export class SetInterval extends Frequency {
    constructor(
        timesPerInterval: number, skipIntervals: number, 
        public interval: Interval
    ) {
        super(timesPerInterval, skipIntervals);
    }

    getDecay(dueDate: Date): number {
        const msSince = this.getMsSinceDue(dueDate);
        const intervalMs = getIntervalMillis(this.interval);
        const intervalsSince = Math.floor(msSince / intervalMs);

        if (intervalsSince > this.skipIntervals) return 0;
        return intervalsSince * this.timesPerInterval;
    }

    updateDueDate(dueDate: Date, now: Date): Date {

        const shift = this.interval === Interval.Monthly
            ? getMillisUntilNextMonth()
            : getMillisUntilNextYear();

        return new Date(dueDate.getTime() + shift);
    }
}

export enum Interval {
    Monthly,
    Yearly
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
        case Interval.Monthly: return getMillisSinceLastMonth();
        case Interval.Yearly: return getMillisSinceLastYear();
        default: return 0;
    }
};

