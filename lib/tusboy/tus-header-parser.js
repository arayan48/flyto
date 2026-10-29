const decodeMetadata = require('./tus-metadata').decode;

// parseInt would also take floats and leading zeros
const nonNegativeInteger = (v) => {
  if (v !== '0' && !/^[1-9][0-9]*$/.test(v)) return
  const num = parseInt(v, 10)
  if (Number.isSafeInteger(num)) return num
}

const parsers = {
  'tus-resumable': { name: 'tusResumable', parse: v => v },
  'upload-offset': { name: 'uploadOffset', parse: nonNegativeInteger },
  'upload-defer-length': { name: 'uploadDeferLength', parse: v => (v === '1' ? 1 : undefined) },
  'upload-length': { name: 'uploadLength', parse: nonNegativeInteger },
  'upload-metadata': { name: 'uploadMetadata', parse: decodeMetadata },
}

module.exports = () => (req, res, next) => {
  req.tus = Object.fromEntries(Object.keys(req.headers)
    .filter(header => header in parsers)
    .map(header => [parsers[header].name, parsers[header].parse(req.headers[header])]))
  next()
};
