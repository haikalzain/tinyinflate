function Inflater() {
}

Inflater.prototype.inflateRaw = function(byteArray) {
    const writer = new Writer();
    const reader = new BitReader(byteArray);
    this._readBlocks(reader, writer);
    return writer.asArray();
}

Inflater.prototype.inflateZlib = function(byteArray) {
    if(byteArray.length < 3 || (byteArray[0] & 0x0f) !== 8) {
        throw new Error('Invalid Zlib format');
    }
    if((byteArray[1] & 32) !== 0) {
        throw new Error('FDICT unsupported');
    }
    if((((byteArray[0] << 8) | byteArray[1]) % 31) !== 0) {
        throw new Error('Invalid Zlib format');
    }
    const result = this.inflateRaw(byteArray.subarray(2, byteArray.length - 4));
    const checksum = new DataView(byteArray.buffer, byteArray.offset).getInt32(byteArray.length - 4, false);
    if(checksum !== adler32(result)) {
        throw new Error('Zlib checksum invalid');
    }
    return result;
}

Inflater.prototype.inflateGzip = function(byteArray) {
    if(byteArray.length < 4) throw new Error('Invalid Gzip format');
    if(byteArray[0] !== 31 || byteArray[1] !== 139 || byteArray[2] !== 8) {
        throw new Error('Invalid Gzip format');
    }
    const flag = byteArray[3];
    const dataView = new DataView(byteArray.buffer, byteArray.offset);
    let offset = 10;
    if((flag & 2) !== 0) { // FHCRC
        offset += 2;
    }
    if((flag & 4) !== 0) { // FEXTRA
        const xlen = dataView.getUint16(offset, true);
        offset += 2 + xlen;
    }
    if((flag & 8) !== 0) { // FNAME
        while(byteArray[offset++] !== 0){}
    }
    if((flag & 16) !== 0) { // FCOMMENT
        while(byteArray[offset++] !== 0){}
    }
    const result = this.inflateRaw(byteArray.subarray(offset, byteArray.length - 8));
    const checksum = dataView.getInt32(byteArray.length - 8, true);
    //const size = dataView.getUint32(byteArray.length - 4, true);
    if(checksum !== crc32(result)) {
        throw new Error('Gzip checksum invalid');
    }
    return result;
}

Inflater.prototype._readBlocks = function (reader, writer) {
    let last = 0;
    while (!last) {
        last = reader.readBits(1);
        const type = reader.readBits(2);
        switch (type) {
            case 0:
                this._readUncompressedBlock(reader, writer);
                break;
            case 1:
                this._readStaticHuffmanBlock(reader, writer);
                break;
            case 2:
                this._readDynamicHuffmanBlock(reader, writer);
                break;
            default:
                throw new Error(`Invalid block type: ${type}`);
        }
    }
}

Inflater.prototype._readUncompressedBlock = function (reader, writer) {
    let len = reader.readUint16();
    const nlen = reader.readUint16();
    if ((~len & 65535) !== nlen) {
        throw new Error(`Len ${len} of uncompressed does not correspond to nlen ${nlen}`);
    }
    while (len--) {
        writer.writeByte(reader.readByte());
    }
}

Inflater.prototype._decodeHuffman = function (symbolHuffman, distanceHuffman, reader, writer) {
    for (; ;) {
        let symbol = symbolHuffman.readNext(reader);
        if (symbol === 256) return;
        if (symbol < 256) writer.writeByte(symbol);
        else {
            symbol -= 257;
            const length = lBase[symbol] + reader.readBits(lExt[symbol]);
            const rawDistance = distanceHuffman.readNext(reader);
            const distance = dBase[rawDistance] + reader.readBits(dExt[rawDistance]);
            writer.copyToOutput(distance, length);
        }
    }
}

Inflater.prototype._readStaticHuffmanBlock = function (reader, writer) {
    const [symbolHuffman, distanceHuffman] = staticHuffmanTree();
    this._decodeHuffman(symbolHuffman, distanceHuffman, reader, writer);
}

Inflater.prototype._readDynamicHuffmanBlock = function (reader, writer) {
    const nSymbol = reader.readBits(5) + 257;
    const nDist = reader.readBits(5) + 1;
    const nCodes = reader.readBits(4) + 4;

    const codeLengths = new Uint8Array(19);
    const huffmanLengths = new Uint8Array(nSymbol + nDist);

    for (let i = 0; i < nCodes; i++) {
        codeLengths[codeOrder[i]] = reader.readBits(3);
    }

    const codeHuffman = new Huffman(codeLengths);
    for (let i = 0; i < nSymbol + nDist; i++) {
        let symbol = codeHuffman.readNext(reader);
        if (symbol < 16) {
            huffmanLengths[i] = symbol;
        } else {
            symbol -= 16;
            let reps = codeBase[symbol] + reader.readBits(codeExt[symbol]);
            const symbolToCopy = symbol === 0 ? huffmanLengths[i - 1] : 0;
            while (reps--) {
                huffmanLengths[i++] = symbolToCopy;
            }
            i--;
        }
    }

    return this._decodeHuffman(
        new Huffman(huffmanLengths.subarray(0, nSymbol)),
        new Huffman(huffmanLengths.subarray(nSymbol, nSymbol + nDist)),
        reader,
        writer);
}

function Writer() {
    this.arr = [];
}

Writer.prototype.writeByte = function (b) {
    this.arr.push(b);
}

Writer.prototype.copyToOutput = function (distance, length) {
    let offset = this.arr.length - distance;
    while (length--) this.arr.push(this.arr[offset++]);
}

Writer.prototype.asArray = function () {
    return new Uint8Array(this.arr);
}

function BitReader(byteArray) {
    this.byteArray = byteArray;
    this.offset = 0;
    this.remainingBits = 0;
    this.cachedByte = 0;
}

BitReader.prototype.readBits = function (n) {
    // reads from LSB
    let result = 0;
    let bitsTaken = 0;
    while (n > 0) {
        if (this.remainingBits === 0) {
            this.remainingBits = 8;
            this.cachedByte = this._nextByte();
        }
        const bitsToTake = Math.min(this.remainingBits, n);
        const mask = (1 << bitsToTake) - 1;
        result |= ((mask & this.cachedByte) << bitsTaken);
        //result = result << bitsToTake | ((mask & this.cachedByte);
        this.cachedByte >>= bitsToTake;
        this.remainingBits -= bitsToTake;
        n -= bitsToTake;
        bitsTaken += bitsToTake;
    }
    return result;
}

// finishCurrentByte then reads next byte.
BitReader.prototype.readByte = function () {
    this.finishCurrentByte();
    return this._nextByte();

}

BitReader.prototype.readUint16 = function () {
    this.finishCurrentByte();
    let result = this._nextByte();
    result |= this._nextByte() << 8;
    return result;
}

BitReader.prototype._nextByte = function () {
    return this.byteArray[this.offset++];
}

BitReader.prototype.finishCurrentByte = function () {
    this.remainingBits = 0;
}

let staticHuffmanCache = null;
function staticHuffmanTree() {
    if(staticHuffmanCache == null) {
        const arr = new Uint8Array(288)
        let i = 0;
        for (; i < 144; i++) {
            arr[i] = 8;
        }
        for (; i < 256; i++) {
            arr[i] = 9;
        }
        for (; i < 280; i++) {
            arr[i] = 7;
        }
        for (; i < 288; i++) {
            arr[i] = 8;
        }

        const arr2 = new Uint8Array(32);
        for (i = 0; i < 32; i++) arr2[i] = 5;
        staticHuffmanCache = [new Huffman(arr), new Huffman(arr2)];
    }
    return staticHuffmanCache;
}

const MAXBITS = 15;

function Huffman(lengths) {
    this.lookup = [];
    for (let i = 0; i <= MAXBITS; i++) this.lookup.push(new Map());
    const counts = new Uint16Array(MAXBITS + 1);

    for (let i = 0; i < lengths.length; i++) {
        counts[lengths[i]]++;
    }
    counts[0] = 0; // ignore codes of length 0
    const firstCodeForLength = new Uint16Array(MAXBITS + 1);
    for (let i = 1; i <= MAXBITS; i++) {
        firstCodeForLength[i] = (firstCodeForLength[i - 1] + counts[i - 1]) << 1;
    }

    for (let i = 0; i < lengths.length; i++) {
        const length = lengths[i];
        this.lookup[length].set(firstCodeForLength[length]++, i);
    }
}

Huffman.prototype.readNext = function (reader) {
    let code = 0;
    for (let i = 1; i <= MAXBITS; i++) {
        code <<= 1;
        code |= reader.readBits(1);
        const symbol = this.lookup[i].get(code);
        if (symbol !== undefined) {
            return symbol;
        }
    }
    throw new Error(`Unable to decode huffman code ${code}, bits ${MAXBITS}`);
}

const lBase = new Uint16Array([
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258
]);

const lExt = new Uint8Array([
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
]);

const dBase = new Uint16Array([ /* Distance codes 0..29 base */
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
    8193, 12289, 16385, 24577
]);

const dExt = new Uint8Array([ /* Distance codes 0..29 extra */
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    7, 7, 8, 8, 9, 9, 10, 10, 11, 11,
    12, 12, 13, 13
]);

const codeOrder = new Uint8Array([
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15
]);
const codeBase = new Uint8Array([3, 3, 11]);
const codeExt = new Uint8Array([2, 3, 7]); //16 - 18

let crcTable = new Uint32Array(256);

function computeCrcTable() {
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            if (c & 1) {
                c = 0xedb88320 ^ (c >>> 1);
            } else {
                c = c >>> 1;
            }
        }
        crcTable[n] = c;
    }
}

function adler32(buf) {
    // see https://github.com/SheetJS/js-adler32/blob/master/adler32.js
    let a = 1, b = 0, M = 0;
    const L = buf.length;
    for(let i = 0; i < L;) {
        M = Math.min(L-i, 2654)+i;
        for(;i<M;i++) {
            a += buf[i]&0xFF;
            b += a;
        }
        a = (15*(a>>>16)+(a&65535));
        b = (15*(b>>>16)+(b&65535));
    }
    return ((b%65521) << 16) | (a%65521);
}

function crc32(buf) {
    if(crcTable[1] === 0) computeCrcTable();
    let c = 0xffffffff;
    for(let n=0;n<buf.length;n++) {
        c = crcTable[(c ^ buf[n]) & 0xff] ^ (c >>> 8);
    }
    return c ^ 0xffffffff;
}

module.exports = {
    Inflater
}