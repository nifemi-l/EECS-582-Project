export abstract class Frequency {
    constructor(
        public timesPerInterval: number,
        public skipIntervals: number,
        public resetOnCompletion: boolean
    ) {}

    abstract getDecay(Date): number;
    //TODO: abstract updateNextDueDate(): Date;

    protected getMsSinceDue(dueDate : Date): number {
        const now = new Date();
        if (now <= dueDate) return 0;
        return Math.abs(dueDate.getTime() - now.getTime());
    }

}

// Type of frequency - A certain amount of days in between 
export class DayAmount extends Frequency {
    constructor(
        timesPerInterval: number, skipIntervals: number, resetOnCompletion: boolean,
        public numDays: number
    ) {
        super(timesPerInterval, skipIntervals, resetOnCompletion);
    }

    getDecay(dueDate : Date): number {
        const msSince = this.getMsSinceDue(dueDate);
        const daysSince = Math.floor(msSince / 86400000);
        const intervalsSince = Math.floor(daysSince / this.numDays);

        if (intervalsSince > this.skipIntervals) return 0;
        return intervalsSince * this.timesPerInterval;
    }
}

// Type of frequency - Once per month, once per year. Varies differently than things like weekly
export class SetInterval extends Frequency {
    constructor(
        timesPerInterval: number, skipIntervals: number, resetOnCompletion: boolean,
        public interval: Interval
    ) {
        super(timesPerInterval, skipIntervals, resetOnCompletion);
    }

    getDecay(dueDate : Date): number {
        const msSince = this.getMsSinceDue(dueDate);
        const intervalMs = getIntervalMillis(this.interval);
        const intervalsSince = Math.floor(msSince / intervalMs);

        if (intervalsSince > this.skipIntervals) return 0;
        return intervalsSince * this.timesPerInterval;
    }
}

enum Interval {
    Monthly,
    Yearly
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

