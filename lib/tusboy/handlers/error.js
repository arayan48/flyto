// http-errors meant for the client (4xx) are answered here, anything else goes to the app
module.exports = (err, req, res, next) => {
  if (res.headersSent || !(err instanceof Error) || !err.status || !err.expose) return next(err)
  res.status(err.status).json({
    name: err.name,
    message: err.message,
    details: err.details,
  })
}
