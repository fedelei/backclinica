
import jwt from "jsonwebtoken";
import crypto from "crypto";
import pool from "../database.js"; // Ajustá a la ubicación real de tu pool

export function obtenerHashToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

export async function autenticarToken(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Token no proporcionado"
        });
    }

    const token = authorization.slice(7);

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        const tokenHash = obtenerHashToken(token);

        const revocados = await pool.query(
            `SELECT id
             FROM tokens_revocados
             WHERE token_hash = ?
             LIMIT 1`,
            [tokenHash]
        );

        if (revocados.length > 0) {
            return res.status(401).json({
                message: "La sesión fue cerrada"
            });
        }

        req.user = decoded;
        req.token = token;

        return next();

    } catch (error) {
        if (
            error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" ||
            error.name === "NotBeforeError"
        ) {
            return res.status(401).json({
                message: "Token inválido o expirado"
            });
        }

        console.error("Error al validar token:", error);

        return res.status(500).json({
            message: "Error al validar la sesión"
        });
    }
}

/**
 * Igual que autenticarToken, pero si no hay Bearer continúa sin req.user.
 * Útil para endpoints que sirven tanto al panel (con JWT) como al wizard público.
 */
export async function autenticarTokenOpcional(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
        return next();
    }

    return autenticarToken(req, res, next);
}
