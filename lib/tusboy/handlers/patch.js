// PATCH: append bytes at Upload-Offset, see https://tus.io/protocols/resumable-upload#patch
const storeErrors = require('../store/errors');
const errors = require('../errors');
const utils = require('../../utils');

module.exports = (store, { afterComplete = async () => {} }) => (async (req, res) => {
  if (req.tus.uploadOffset === undefined) {
    throw errors.invalidHeader('upload-offset', req.get('upload-offset'))
  }
  if (req.get('content-type') !== 'application/offset+octet-stream') {
    throw errors.invalidHeader('content-type', req.get('content-type'))
  }

  const uploadId = req.params.uploadId
  if (!utils.isSafeTusUploadId(uploadId)) {
    throw errors.unknownResource(uploadId)
  }

  try {
    const { offset, upload } = await store.append(uploadId, req, req.tus.uploadOffset, {
      contentLength: Number(req.get('content-length')) || undefined,
    })
    if (upload.uploadLength === offset) {
      await afterComplete(req, upload, uploadId)
    }
    res.set('Upload-Offset', offset)
    res.status(204)
    res.end()
  } catch (err) {
    if (err instanceof storeErrors.OffsetMismatch) {
      throw errors.offsetMismatch(req.tus.uploadOffset, err.offset)
    }
    throw err
  }
})
