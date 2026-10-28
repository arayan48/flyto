const base64decode = str => Buffer.from(str, 'base64').toString('utf8')
const base64encode = str => Buffer.from(str, 'utf8').toString('base64')

// Upload-Metadata: comma separated "key base64(value)" pairs
module.exports.decode = (str = '') => Object.fromEntries(str
  .split(',')
  .map(s => s.split(' '))
  .filter(([key, val, ...rest]) => key !== '' && val !== undefined && !rest.length)
  .map(([key, val]) => [key, base64decode(val)]))

module.exports.encode = (obj = {}) => Object
  .entries(obj)
  .map(([key, val]) => `${key} ${base64encode(val)}`)
  .join(',')
