const bm = require('benchmark');
const pako = require('pako');
const fflate = require('fflate');
const fs = require('fs');
const {Inflater} = require('..');

const suite = new bm.Suite('Inflate sample');
const compressed = fs.readFileSync('../test/samples/deflate.bin');

// should verify result and throw error if wrong
suite.add('pako', () => {
    const result = pako.inflate(compressed);
    console.assert(result.length === 101345);
}).add('fflate', () => {
    const result = fflate.unzlibSync(compressed);
    console.assert(result.length === 101345);
}).add('tinygzip', () => {
    const inflater = new Inflater();
    const result = inflater.inflateZlib(compressed);
    console.assert(result.length === 101345);
}).on('cycle', function(event) {
    console.log(String(event.target));
}).run()

const suiteGzip = new bm.Suite('Inflate gzip');
const compressedGzip = fs.readFileSync('../test/samples/vs.gz');

suiteGzip.add('pako', () => {
    const result = pako.inflate(compressedGzip);
    console.assert(result.length === 101345);
}).add('fflate', () => {
    const result = fflate.gunzipSync(compressedGzip);
    console.assert(result.length === 101345);
}).add('tinygzip', () => {
    const inflater = new Inflater();
    const result = inflater.inflateGzip(compressedGzip);
    console.assert(result.length === 101345);
}).on('cycle', function(event) {
    console.log(String(event.target));
}).run();
