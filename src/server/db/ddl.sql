/*
File name: ddl.sql
Description: SQL file containing the DDL for the project database
Programmers: Blake Carlson, Logan Smith, Nifemi Lawal
Creation Date: 2/15/2026
Revision date:
    - 3/19/26: Added Household Relation
    - 3/29/26: Added icon columns to Feature and Task tables
    - 4/1/26: Added the Environmental Data relation for Enviro+ sensor data
    - 4/13/26: Added Room table and Feature.room_id for list-view grouping
Preconditions: N/A
Postconditions: Create the base structure of the database with the tables, attributes, and data types
Errors: None
Side effects: None
Invariants: The structure of the database must match the DDL
Known faults: None. 

The tables that will need to be created are
    Household
    Account
    HouseholdMember
    Room
    Feature
    Task
*/

/* 
Create a table for the Households
    Attributes:
        ID (Primary key) : Int
        name : String
        join code : String
        created_by : Int
        created_at : Time
        updated_at : Time
*/
CREATE TABLE IF NOT EXISTS Household (
    /* Household has an id as the primary key */
    household_id SERIAL PRIMARY KEY CHECK (household_id > 0),
    /* The name of the household */
    household_name VARCHAR(50) NOT NULL,
    /* Shareable code used for joining a household; should be unique */
    join_code VARCHAR(20) NOT NULL UNIQUE,
    /* Track which account originally created the household */
    created_by_account_id INTEGER,
    /* Store time the household is created */
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    /* Store time the household was last updated */
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

/*
Create a table for Accounts
    Attributes:
        Number (Primary Key)
        Name
        Linked to a household by household_id
*/
CREATE TABLE IF NOT EXISTS Account (
    /* Account id is the primary key */
    account_id SERIAL PRIMARY KEY CHECK (account_id > 0),
    /* A single account can be a part of multiple households
        Add a many to many relationship table
    */
    /* The name of the account */
    account_name VARCHAR(50) NOT NULL,
    /* Store a hashed version of the user's password for security */
    hashed_password VARCHAR(255) NOT NULL,
    /* Each account should have a unique email for login */
    email VARCHAR(255) NOT NULL UNIQUE,
    /* Store time the account is created */
    created_at TIMESTAMPTZ DEFAULT NOW(),
    /* Last login time */
    last_login TIMESTAMPTZ
);

/* Constraint on created_by_account_id to ensure it is an active account and is replaced by NULL if deleted */
ALTER TABLE Household
ADD CONSTRAINT fk_household_created_by
FOREIGN KEY (created_by_account_id)
REFERENCES Account(account_id)
ON DELETE SET NULL;

/* Create a table for household membership / roles
    Each account could have a different role in each household
    The roles are either "admin" and "member"
*/
CREATE TABLE IF NOT EXISTS HouseholdMember (
    account_id INTEGER NOT NULL
        REFERENCES Account(account_id) ON DELETE CASCADE,
    household_id INTEGER NOT NULL
        REFERENCES Household(household_id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL
        CHECK (role IN ('admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, household_id)
);

/*
Rooms: logical grouping for features in the list view (optional accent_color hex for UI).
*/
CREATE TABLE IF NOT EXISTS Room (
    room_id SERIAL PRIMARY KEY CHECK (room_id > 0),
    household_id INTEGER NOT NULL
        REFERENCES Household(household_id) ON DELETE CASCADE,
    room_name VARCHAR(80) NOT NULL,
    accent_color VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_household ON Room (household_id);

/*
Create a table for cleanable features
    Attributes:
        Feature id (Primary Key)
        Feature name
        Feature Type
        Position
            X
            Y
            Z
    Linked to household by household_id
*/
CREATE TABLE IF NOT EXISTS Feature (
    /* Positive id for features as the primary key */
    feature_id SERIAL PRIMARY KEY CHECK (feature_id > 0),
    /* Household id should link the feature to a specific household 
        Is cascade needed here?
    */
    household_id INTEGER REFERENCES Household(household_id) ON DELETE CASCADE,
    /* Name and types of the feature */
    feature_name VARCHAR(50) NOT NULL,
    feature_type VARCHAR(50),
    /* Do I have x, y, and z as separate or one position with all 3?
        Make floats */
    x_pos FLOAT NOT NULL,
    y_pos FLOAT NOT NULL,
    z_pos FLOAT NOT NULL,
    /* MaterialCommunityIcons name shown in the list view for this feature/room
        Defaults to the generic home icon if not specified */
    icon VARCHAR(50) DEFAULT 'home-outline',
    room_id INTEGER REFERENCES Room(room_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_feature_room ON Feature (room_id);

/*
Create a feature for the individual tasks
    Attributes:
        Name (Primary key)
        Frequency
        Last_Completed
*/
CREATE TABLE IF NOT EXISTS Task (
    /* Id for each individual task which is used as a primary key */
    task_id SERIAL PRIMARY KEY,
    /* Use feature id to link each task to a particular feature 
        Is cascade needed here?
    */
    feature_id INTEGER REFERENCES Feature(feature_id) ON DELETE CASCADE,
    /* Name of the task */
    task_name VARCHAR(50) NOT NULL,
    /* # of days for how often the task needs to be done */
    frequency_days INTEGER NOT NULL,
    /* Last completed is stored as a time stamp. timestamptz includes timezone as well converting to UTC */
    last_completed TIMESTAMPTZ,
    /* Temporary implementation of privacy settings for tasks 
        The visibility options will be "private" and "household" or something to that effect
            Ex: doing my personal laundry shouldn't be public to everyone in the house
    */
    visibility VARCHAR(20) CHECK (visibility IN ('private', 'household')) NOT NULL,
    /* Account id for the account that created the task */
    created_by_account_id INTEGER REFERENCES Account(account_id) ON DELETE SET NULL,
    /* MaterialCommunityIcons name shown next to the task in the list view
        Defaults to the clipboard icon if not specified */
    icon VARCHAR(50) DEFAULT 'clipboard-text-outline'
);

/*
Create a relation for storing the sensor data. "Environmentaldata"
    Attributes:
        data_id : Primary key for identifying a data sample
        household_id : Links a data sample to the household it is a measurement for
        temperature_C : The temperature reading from the Enviro+ sensor, in degrees Celcius (rounded to nearest int)
        relative_humidity : The relative humidity reading from the Enviro+ sensor (rounded to nearest whole percent)
        recorded_at : The timestamp that the sensor readings took place at
*/

/* Update temperature and relative humidity from floats to ints? */
CREATE TABLE IF NOT EXISTS EnvironmentalData (
    data_id SERIAL PRIMARY KEY,
    household_id INTEGER REFERENCES Household(household_id) ON DELETE CASCADE,
    temperature_C INTEGER,
    relative_humidity INTEGER,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


