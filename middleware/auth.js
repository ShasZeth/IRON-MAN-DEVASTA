const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            success: false,
            message: "Brak tokenu"
        });
    }

    try {

        const token =
            authHeader.replace("Bearer ", "");

        const decoded =
            jwt.verify(
                token,
                "SUPER_SECRET_KEY"
            );

        req.user = decoded;

        next();

    } catch (err) {

        res.status(401).json({
            success: false,
            message: "Nieprawidłowy token"
        });

    }

};