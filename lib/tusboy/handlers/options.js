// OPTIONS: what the server supports, see https://tus.io/protocols/resumable-upload#options
const { TUS_VERSION } = require('../constants');

module.exports = (req, res) => {
  res.set('Tus-Version', TUS_VERSION)
  res.set('Tus-Extension', 'creation')
  res.status(204).end()
}
