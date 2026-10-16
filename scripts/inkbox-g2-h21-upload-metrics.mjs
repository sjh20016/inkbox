export function classifyWebGLUpload(method, args) {
  const result = {
    kind: method.startsWith('buffer') ? 'buffer' : 'texture',
    bufferUploadBytesKnown: 0,
    textureUploadBytesKnown: 0,
    uploadSourceBytesUpperBound: 0,
    uploadUnknownByteCalls: 0,
    bufferAllocationBytesKnown: 0,
    unknown: false,
  };
  const failUnknown = () => { result.unknown = true; result.uploadUnknownByteCalls = 1; return result; };
  const sourceBytes = value => {
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (value instanceof ArrayBuffer) return value.byteLength;
    return null;
  };
  const isValidRange = (offset, length, limit) => Number.isInteger(offset) && offset >= 0
    && Number.isInteger(length) && length >= 0 && offset + length <= limit;

  if (method === 'bufferData') {
    if (typeof args[1] === 'number' && Number.isFinite(args[1]) && args[1] >= 0) {
      // WebGL allocates storage here; this is capacity, not a source upload.
      result.bufferAllocationBytesKnown = args[1];
      return result;
    }
    const bytes = sourceBytes(args[1]);
    if (bytes === null) return failUnknown();
    result.bufferUploadBytesKnown = bytes;
    result.uploadSourceBytesUpperBound = bytes;
    return result;
  }

  if (method === 'bufferSubData') {
    const source = args[2];
    const bytes = sourceBytes(source);
    if (bytes === null) return failUnknown();
    if (args.length <= 3) {
      result.bufferUploadBytesKnown = bytes;
      result.uploadSourceBytesUpperBound = bytes;
      return result;
    }
    if (!ArrayBuffer.isView(source) || !Number.isFinite(source.BYTES_PER_ELEMENT)
        || !Number.isInteger(source.length)) return failUnknown();
    const srcOffset = args[3];
    const length = args.length >= 5 ? args[4] : source.length - srcOffset;
    if (!isValidRange(srcOffset, length, source.length)) return failUnknown();
    result.bufferUploadBytesKnown = length * source.BYTES_PER_ELEMENT;
    result.uploadSourceBytesUpperBound = result.bufferUploadBytesKnown;
    return result;
  }

  const compressed = method.startsWith('compressedTex');
  const image = method === 'texImage2D' || method === 'texImage3D';
  const subImage = method === 'texSubImage2D' || method === 'texSubImage3D';
  const compressedImage = method === 'compressedTexImage2D' || method === 'compressedTexImage3D';
  const compressedSubImage = method === 'compressedTexSubImage2D' || method === 'compressedTexSubImage3D';
  if (!compressed && !image && !subImage && !compressedImage && !compressedSubImage) return failUnknown();

  let sourceIndex;
  if (image) sourceIndex = args.length >= 9 ? 8 : 5;
  else if (subImage) sourceIndex = args.length >= 9 ? 8 : 6;
  else if (compressedImage) sourceIndex = 6;
  else sourceIndex = 7;
  const source = args[sourceIndex];
  const bytes = sourceBytes(source);
  if (bytes === null) return failUnknown();

  if (compressed) {
    const hasOffset = args.length > sourceIndex + 1;
    if (!hasOffset) {
      result.textureUploadBytesKnown = bytes;
      result.uploadSourceBytesUpperBound = bytes;
      return result;
    }
    const offset = args[sourceIndex + 1];
    const length = args[sourceIndex + 2] === undefined ? bytes - offset : args[sourceIndex + 2];
    if (!isValidRange(offset, length, bytes)) return failUnknown();
    result.textureUploadBytesKnown = length;
    result.uploadSourceBytesUpperBound = length;
    return result;
  }

  // For uncompressed texture uploads the byte interpretation depends on format,
  // type, unpack alignment/row length, skips, and possibly a bound PBO.
  result.uploadSourceBytesUpperBound = bytes;
  result.unknown = true;
  result.uploadUnknownByteCalls = 1;
  return result;
}

export function addUploadMetrics(row, classification) {
  const field = classification.kind === 'buffer' ? 'bufferUploadCalls' : 'textureUploadCalls';
  row[field] = (row[field] || 0) + 1;
  row.bufferUploadBytesKnown = (row.bufferUploadBytesKnown || 0) + classification.bufferUploadBytesKnown;
  row.textureUploadBytesKnown = (row.textureUploadBytesKnown || 0) + classification.textureUploadBytesKnown;
  row.uploadSourceBytesUpperBound = (row.uploadSourceBytesUpperBound || 0) + classification.uploadSourceBytesUpperBound;
  row.uploadUnknownByteCalls = (row.uploadUnknownByteCalls || 0) + classification.uploadUnknownByteCalls;
  row.bufferAllocationBytesKnown = (row.bufferAllocationBytesKnown || 0) + classification.bufferAllocationBytesKnown;
}
