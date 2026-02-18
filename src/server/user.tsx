import Household from "./household"

export default class User {
    household: Household 
    readonly username : string 
    readonly password : string 

    constructor(household : Household, username: string, password : string){
        this.household = household;
        this.username = username; 
        this.password = password;
    }
}
