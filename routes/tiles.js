const express = require("express");
const db = require("../database/db");
const auth = require("../middleware/auth");

const router = express.Router();

router.get("/taken/list", auth, (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({
            success: false,
            message: "Brak uprawnień administratora"
        });
    }

    db.all(
        `
        SELECT tiles.id, users.nickname
        FROM tiles
        JOIN users ON users.id = tiles.takenBy
        WHERE tiles.taken = 1
        ORDER BY tiles.id
        `,
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false });
            }

            res.json(rows);
        }
    );
});

router.post("/unlock/:id", auth, (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({
            success: false,
            message: "Brak uprawnień administratora"
        });
    }

    const tileId = req.params.id;

    db.run(
        `
        UPDATE tiles
        SET taken = 0,
            takenBy = NULL,
            takenAt = NULL
        WHERE id = ?
        `,
        [tileId],
        function(err) {
            if (err) {
                return res.status(500).json({ success: false });
            }

            res.json({
                success: true,
                message: "Kafelek odblokowany"
            });
        }
    );
});

router.get("/", (req, res) => {
    db.all(
        `
        SELECT tiles.*, users.nickname
        FROM tiles
        LEFT JOIN users ON users.id = tiles.takenBy
        ORDER BY tiles.id
        `,
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false });
            }

            res.json(rows);
        }
    );
});

router.post("/:id", auth, (req, res) => {
    const tileId = req.params.id;

    db.get(
        "SELECT * FROM tiles WHERE id = ?",
        [tileId],
        (err, tile) => {
            if (err || !tile) {
                return res.status(404).json({
                    success: false,
                    message: "Kafelek nie istnieje"
                });
            }

            if (tile.taken) {
                return res.status(400).json({
                    success: false,
                    message: "Kafelek jest już zajęty"
                });
            }

            db.run(
                `
                UPDATE tiles
                SET taken = 1,
                    takenBy = ?,
                    takenAt = datetime('now')
                WHERE id = ?
                `,
                [req.user.id, tileId],
                function(err) {
                    if (err) {
                        return res.status(500).json({ success: false });
                    }

                    res.json({
                        success: true,
                        message: "Kafelek został zajęty"
                    });
                }
            );
        }
    );
});

module.exports = router;