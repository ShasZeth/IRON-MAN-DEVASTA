const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../database/db");

const router = express.Router();

router.post("/register", async (req, res) => {
    const { nickname, password } = req.body;

    if (!nickname || !password) {
        return res.status(400).json({
            success: false,
            message: "Podaj nickname i hasło"
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            `
            INSERT INTO users (nickname, password)
            VALUES (?, ?)
            RETURNING id
            `,
            [nickname, hashedPassword],
            function (err) {
                if (err) {
                    return res.status(400).json({
                        success: false,
                        message: "Nickname jest już zajęty"
                    });
                }

                res.json({
                    success: true,
                    userId: this.lastID
                });
            }
        );

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Błąd serwera"
        });
    }
});

router.post("/login", (req, res) => {
    const { nickname, password } = req.body;

    db.get(
        "SELECT * FROM users WHERE nickname = ?",
        [nickname],
        async (err, user) => {
            if (err || !user) {
                return res.status(401).json({
                    success: false,
                    message: "Nieprawidłowy login lub hasło"
                });
            }

            const validPassword = await bcrypt.compare(password, user.password);

            if (!validPassword) {
                return res.status(401).json({
                    success: false,
                    message: "Nieprawidłowy login lub hasło"
                });
            }

            const token = jwt.sign(
                {
                    id: user.id,
                    nickname: user.nickname,
                    isAdmin: user.isadmin === 1 || user.isAdmin === 1
                },
                process.env.JWT_SECRET || "SUPER_SECRET_KEY",
                {
                    expiresIn: "7d"
                }
            );

            res.json({
                success: true,
                token
            });
        }
    );
});

module.exports = router;