const {Inflater} = require('..');
const fs = require('fs');

describe('inflates uncompressed block', () => {
    it('simple', () => {
        const payload = new Array(261).fill(0xab);
        const data = new Uint8Array([0x01, 5, 1, 0xfa, 0xfe].concat(payload));
        const result = new Inflater().inflateRaw(data);
        expect(result).toEqual(new Uint8Array(payload));

    })
})

describe('inflates static huffman block', () => {
    it('inflates codes correctly', () => {
        const payload = new Array(261).fill(0xab);
        const data = new Uint8Array([0x01, 5, 1, 0xfa, 0xfe].concat(payload));
        const result = new Inflater().inflateRaw(data);
        expect(result).toEqual(new Uint8Array(payload));
    })
})

describe('deflate raw', () => {
    it('inflates zeros.raw', () => {
        const data = fs.readFileSync('test/zeros.raw');
        const result = new Inflater().inflateRaw(data);
        expect(result.length).toEqual(1234567);
    })

    it('inflates deflateRaw.bin', () => {
        const data = fs.readFileSync('test/samples/deflateRaw.bin');
        const expected = fs.readFileSync('test/samples/lorem_en_100k.txt');
        const result = new Inflater().inflateRaw(data);
        expect(result.length).toEqual(expected.length);
        expect(Array.from(result)).toEqual(Array.from(expected));
    })

    it('inflates deflateRaw_level=1.bin', () => {
        const data = fs.readFileSync('test/samples/deflateRaw_level=1.bin');
        const expected = fs.readFileSync('test/samples/lorem_en_100k.txt');
        const result = new Inflater().inflateRaw(data);
        expect(result.length).toEqual(expected.length);
        expect(Array.from(result)).toEqual(Array.from(expected));
    })

    it('inflates deflateRaw_level=4.bin', () => {
        const data = fs.readFileSync('test/samples/deflateRaw_level=4.bin');
        const expected = fs.readFileSync('test/samples/lorem_en_100k.txt');
        const result = new Inflater().inflateRaw(data);
        expect(result.length).toEqual(expected.length);
        expect(Array.from(result)).toEqual(Array.from(expected));
    })

    it('inflates deflateRaw_windowBits=15.bin', () => {
        const data = fs.readFileSync('test/samples/deflateRaw_windowBits=15.bin');
        const expected = fs.readFileSync('test/samples/lorem_en_100k.txt');
        const result = new Inflater().inflateRaw(data);
        expect(result.length).toEqual(expected.length);
        expect(Array.from(result)).toEqual(Array.from(expected));
    })
})

describe('deflate zlib', () => {
    it('inflates deflate.bin', () => {
        const data = fs.readFileSync('test/samples/deflate.bin');
        const expected = fs.readFileSync('test/samples/lorem_en_100k.txt');
        const result = new Inflater().inflateZlib(data);
        expect(result.length).toEqual(expected.length);
        expect(Array.from(result)).toEqual(Array.from(expected));
    })

    it('inflates deflate_level=1.bin', () => {
        const data = fs.readFileSync('test/samples/deflate_level=1.bin');
        const expected = fs.readFileSync('test/samples/lorem_en_100k.txt');
        const result = new Inflater().inflateZlib(data);
        expect(result.length).toEqual(expected.length);
        expect(Array.from(result)).toEqual(Array.from(expected));
    })

    it('inflates deflate_level=2.bin', () => {
        const data = fs.readFileSync('test/samples/deflate_level=2.bin');
        const expected = fs.readFileSync('test/samples/lorem_en_100k.txt');
        const result = new Inflater().inflateZlib(data);
        expect(result.length).toEqual(expected.length);
        expect(Array.from(result)).toEqual(Array.from(expected));
    })

    it('inflates deflate_level=7.bin', () => {
        const data = fs.readFileSync('test/samples/deflate_level=7.bin');
        const expected = fs.readFileSync('test/samples/lorem_en_100k.txt');
        const result = new Inflater().inflateZlib(data);
        expect(result.length).toEqual(expected.length);
        expect(Array.from(result)).toEqual(Array.from(expected));
    })
})

describe('deflates gzip', () => {
    it('deflates gzip.bin', () => {
        const data = fs.readFileSync('test/samples/gzip.bin');
        const expected = fs.readFileSync('test/samples/lorem_en_100k.txt');
        const result = new Inflater().inflateGzip(data);
        expect(result.length).toEqual(expected.length);
        expect(Array.from(result)).toEqual(Array.from(expected));
    })
})