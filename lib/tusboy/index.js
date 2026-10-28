const { Router } = require('express');
const tusHeaderParser = require('./tus-header-parser');
const { TUS_VERSION } = require('./constants');
const errors = require('./errors');

const errorHandler = require('./handlers/error');
const options = require('./handlers/options');
const head = require('./handlers/head');
const patch = require('./handlers/patch');
const post = require('./handlers/post');

// Express 5 forwards rejected promises, the handlers throw http-errors
const assertTusResumableHeader = (req, res, next) => {
  if (!('tusResumable' in req.tus)) {
    res.set('Tus-Version', TUS_VERSION)
    return next(errors.preconditionError('Tus-Resumable header missing'))
  }
  next()
}

/**
 * Tus 1.0 server with the creation extension
 * @param {Object} opts
 * @param {Function} opts.getKey upload id of a POST
 * @param {Function} [opts.afterComplete] called once all bytes of an upload are stored
 */
module.exports = (store, opts) => new Router()
  .use(tusHeaderParser())
  .options(/.*/, options)
  .use((req, res, next) => {
    res.set('Tus-Resumable', TUS_VERSION)
    next()
  })
  .use(assertTusResumableHeader)
  .post('/', post(store, opts))
  .head('/:uploadId', head(store))
  .patch('/:uploadId', patch(store, opts))
  .use(errorHandler)
