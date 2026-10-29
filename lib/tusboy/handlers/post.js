// POST: create an upload, see https://tus.io/protocols/resumable-upload#creation
const errors = require('../errors');

module.exports = (store, { getKey, afterComplete = async () => {} }) => async (req, res) => {
  const { uploadLength } = req.tus
  if (req.tus.uploadDeferLength) {
    throw errors.preconditionError('Upload-Defer-Length is not supported')
  }
  if (uploadLength === undefined) {
    throw errors.preconditionError('Missing Upload-Length header')
  }

  const uploadId = getKey(req)
  await store.create(uploadId, {
    uploadLength,
    metadata: req.tus.uploadMetadata,
  })
  // clients finish an empty upload right after the POST, it never gets a PATCH
  if (uploadLength === 0) {
    await afterComplete(req, await store.info(uploadId), uploadId)
  }
  res.status(201)
  let basePath = req.baseUrl
  if (basePath[basePath.length - 1] !== '/') basePath += '/'
  res.set('Location', `${basePath}${uploadId}`)
  res.end()
}
