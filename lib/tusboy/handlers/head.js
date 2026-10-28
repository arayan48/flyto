// HEAD: the offset to resume from, see https://tus.io/protocols/resumable-upload#head
const encodeMetadata = require('../tus-metadata').encode;
const utils = require('../../utils');
const errors = require('../errors');

module.exports = (store) => (
  async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const { uploadId } = req.params
    if (!utils.isSafeTusUploadId(uploadId)) {
      throw errors.unknownResource(uploadId)
    }
    const upload = await store.info(uploadId)
    res.set('Upload-Offset', upload.offset)
    res.set('Upload-Length', upload.uploadLength)
    // only the strings the client sent: the server adds numbers and booleans,
    // and the password is stored hashed
    const sent = Object.entries(upload.metadata || {})
      .filter(([key, value]) => key !== 'password' && typeof value === 'string')
    const encodedMetadata = encodeMetadata(Object.fromEntries(sent))
    if (encodedMetadata !== '') {
      res.set('Upload-Metadata', encodedMetadata)
    }
    res.end()
  }
)
