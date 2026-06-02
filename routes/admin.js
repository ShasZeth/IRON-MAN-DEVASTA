const express = require("express");
const db = require("../database/db");

const router = express.Router();

router.post("/make-admin", (req, res) => {
    const { nickname, secret } = req.body;

    if (secret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({
            success: false,
            message: "Nieprawidłowy sekret"
        });
    }

    db.run(
        "UPDATE users SET isAdmin = 1 WHERE nickname = ?",
        [nickname],
        function(err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Błąd bazy"
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Nie znaleziono użytkownika"
                });
            }

            res.json({
                success: true,
                message: `Użytkownik ${nickname} został administratorem`
            });
        }
    );
});

module.exports = router;