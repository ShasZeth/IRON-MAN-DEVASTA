const express = require("express");
const db = require("../database/db");
const auth = require("../middleware/auth");

const router = express.Router();

function requireAdmin(req, res, next) {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({
            success: false,
            message: "Brak uprawnień administratora"
        });
    }

    next();
}

router.get("/test", (req, res) => {
    res.send("ADMIN ROUTE WORKS");
});

router.get("/users", auth, requireAdmin, (req, res) => {
    db.all(
        `
        SELECT
            id,
            nickname,
            isadmin,
            created_at
        FROM users
        ORDER BY id
        `,
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Błąd pobierania użytkowników"
                });
            }

            res.json(rows);
        }
    );
});

router.post("/users/:id/make-admin", auth, requireAdmin, (req, res) => {
    db.run(
        "UPDATE users SET isadmin = 1 WHERE id = ?",
        [req.params.id],
        function(err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Błąd bazy"
                });
            }

            res.json({
                success: true,
                message: "Nadano administratora"
            });
        }
    );
});

router.post("/users/:id/remove-admin", auth, requireAdmin, (req, res) => {
    if (Number(req.params.id) === Number(req.user.id)) {
        return res.status(400).json({
            success: false,
            message: "Nie możesz odebrać admina samemu sobie"
        });
    }

    db.run(
        "UPDATE users SET isadmin = 0 WHERE id = ?",
        [req.params.id],
        function(err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Błąd bazy"
                });
            }

            res.json({
                success: true,
                message: "Odebrano administratora"
            });
        }
    );
});

router.delete("/users/:id", auth, requireAdmin, (req, res) => {
    if (Number(req.params.id) === Number(req.user.id)) {
        return res.status(400).json({
            success: false,
            message: "Nie możesz usunąć sam siebie"
        });
    }

    db.run(
        `
        UPDATE tiles
        SET taken = 0,
            takenby = NULL,
            takenat = NULL,
            screenshot_url = NULL
        WHERE takenby = ?
        `,
        [req.params.id],
        function(err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Błąd resetowania kafelków użytkownika"
                });
            }

            db.run(
                "DELETE FROM users WHERE id = ?",
                [req.params.id],
                function(err) {
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: "Błąd usuwania użytkownika"
                        });
                    }

                    res.json({
                        success: true,
                        message: "Użytkownik usunięty"
                    });
                }
            );
        }
    );
});

router.post("/reset-board", auth, requireAdmin, (req, res) => {
    db.run(
        `
        UPDATE tiles
        SET taken = 0,
            takenby = NULL,
            takenat = NULL,
            screenshot_url = NULL
        `,
        [],
        function(err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Błąd resetowania tablicy"
                });
            }

            db.run(
                `
                INSERT INTO tile_history (tile_id, user_id, action, note)
                VALUES (NULL, ?, 'RESET_BOARD', 'Administrator zresetował całą tablicę')
                `,
                [req.user.id],
                () => {}
            );

            res.json({
                success: true,
                message: "Cała tablica została zresetowana"
            });
        }
    );
});

router.get("/tiles/:id", auth, requireAdmin, (req, res) => {
    db.get(
        `
        SELECT
            tiles.id,
            tiles.taken,
            tiles.takenby,
            tiles.takenat,
            users.nickname
        FROM tiles
        LEFT JOIN users ON users.id = tiles.takenby
        WHERE tiles.id = ?
        `,
        [req.params.id],
        (err, tile) => {
            if (err || !tile) {
                return res.status(404).json({
                    success: false,
                    message: "Nie znaleziono kafelka"
                });
            }

            db.all(
                `
                SELECT
                    tile_history.*,
                    users.nickname
                FROM tile_history
                LEFT JOIN users ON users.id = tile_history.user_id
                WHERE tile_history.tile_id = ?
                ORDER BY tile_history.created_at DESC
                LIMIT 20
                `,
                [req.params.id],
                (err, history) => {
                    if (err) {
                        history = [];
                    }

                    res.json({
                        tile,
                        history
                    });
                }
            );
        }
    );
});

router.post("/tiles/:id/reset", auth, requireAdmin, (req, res) => {
    db.run(
        `
        UPDATE tiles
        SET taken = 0,
            takenby = NULL,
            takenat = NULL,
            screenshot_url = NULL
        WHERE id = ?
        `,
        [req.params.id],
        function(err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Błąd resetowania kafelka"
                });
            }

            db.run(
                `
                INSERT INTO tile_history (tile_id, user_id, action, note)
                VALUES (?, ?, 'RESET_TILE', 'Administrator zresetował kafelek')
                `,
                [req.params.id, req.user.id],
                () => {}
            );

            res.json({
                success: true,
                message: "Kafelek zresetowany"
            });
        }
    );
});

router.post("/tiles/:id/assign", auth, requireAdmin, (req, res) => {
    const { nickname } = req.body;

    if (!nickname) {
        return res.status(400).json({
            success: false,
            message: "Podaj nickname użytkownika"
        });
    }

    db.get(
        "SELECT id FROM users WHERE nickname = ?",
        [nickname],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({
                    success: false,
                    message: "Nie znaleziono użytkownika"
                });
            }

            db.run(
                `
                UPDATE tiles
                SET taken = 1,
                    takenby = ?,
                    takenat = NOW(),
                    screenshot_url = NULL
                WHERE id = ?
                `,
                [user.id, req.params.id],
                function(err) {
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: "Błąd przypisania kafelka"
                        });
                    }

                    db.run(
                        `
                        INSERT INTO tile_history (tile_id, user_id, action, note)
                        VALUES (?, ?, 'ASSIGN_TILE', ?)
                        `,
                        [
                            req.params.id,
                            req.user.id,
                            `Administrator przypisał kafelek użytkownikowi ${nickname}`
                        ],
                        () => {}
                    );

                    res.json({
                        success: true,
                        message: `Kafelek przypisany do ${nickname}`
                    });
                }
            );
        }
    );
});

router.get("/history", auth, requireAdmin, (req, res) => {
    db.all(
        `
        SELECT
            tile_history.*,
            users.nickname
        FROM tile_history
        LEFT JOIN users ON users.id = tile_history.user_id
        ORDER BY tile_history.created_at DESC
        LIMIT 100
        `,
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Błąd historii"
                });
            }

            res.json(rows);
        }
    );
});

module.exports = router;