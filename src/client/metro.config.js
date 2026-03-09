/*
Programmer: Delroy Wright
Description: metro's config for routing and file inclusion
Creation date: 3/8/26
Revision date: 
Preconditions: A client is running and has requested a server function 
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/ 
// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const path = require("path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Allow Metro to watch the sibling server directory
config.watchFolders = [
  path.resolve(__dirname, "../server"),
  path.resolve(__dirname, ".."),
];


// Add support for vertex and fragment shaders
config.resolver.assetExts.push(
    'vert',
    'frag'
);

module.exports = config;
