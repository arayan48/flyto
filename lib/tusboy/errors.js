const createError = require('http-errors');

const invalidHeader = (header, val) => (
  createError(412, 'Precondition Failed', {
    details: { headers: [[header, val]] },
  })
)

const preconditionError = (msg) => createError(412, msg)

const offsetMismatch = (actual, expected) => (
  createError(409, `Offset mismatch, got ${actual} but expected ${expected}`)
)

const unknownResource = (key) => (
  createError(404, `Unknown resource: ${key}`)
)

module.exports = {
  invalidHeader,
  preconditionError,
  offsetMismatch,
  unknownResource,
}
