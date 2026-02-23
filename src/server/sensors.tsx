/* PROLOGUE
File name: sensors.tsx
Description: Class for a sensors attached to a particualr household.
Programmer: Delroy Wright
Creation date: 2/18/26
Revision date: 
Preconditions: A client is running and has access to the Sensors class and any inherited members.
Postconditions: An instantiated Sensors class along with any functions that are required.
Errors: Features may be attempted to be created with invalid data or fields.
Side effects: None
Invariants: None
Known faults: None
*/
export default class Sensors {
    temperature : number;
    humidity : number;
    pressure : number;
    light : number;
    noise : number;
}
