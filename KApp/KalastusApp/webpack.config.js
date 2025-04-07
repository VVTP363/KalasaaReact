const path = require('path');
const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser();
const jsonObj = parser.parse(xmlString);

module.exports = {
  resolve: {
    fallback: {
       buffer: require.resolve("buffer/"),
       timers": require.resolve("timers-browserify")
       stream: require.resolve("stream-browserify"),
       util: require.resolve("util/"),
    },
  },
};