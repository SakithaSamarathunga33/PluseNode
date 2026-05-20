const jwt = require("jsonwebtoken")

const SECRET = process.env.NODE_API_SECRET || "pulsenode-dev-secret"

/**
 * JWT Bearer middleware.
 * In development mode (NODE_ENV=development), bypasses token verification.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function authMiddleware(req, res, next) {
  // Always allow in dev for ease of use
  if (process.env.NODE_ENV !== "production") {
    return next()
  }

  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization header" })
  }

  try {
    req.user = jwt.verify(header.slice(7), SECRET)
    next()
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" })
  }
}

/**
 * Generate a signed JWT for a given payload (used for testing or login).
 * @param {object} payload
 * @returns {string}
 */
function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" })
}

module.exports = { authMiddleware, signToken }
