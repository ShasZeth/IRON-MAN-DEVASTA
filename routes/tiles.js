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
        JOIN users ON users.id = tiles.takenby
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
            takenby = NULL,
            takenat = NULL,
            screenshot_url = NULL
        WHERE id = ?
        `,
        [tileId],
        function(err) {
            if (err) {
                return res.status(500).json({ success: false });
            }

            db.run(
                `
                INSERT INTO tile_history (tile_id, user_id, action, note)
                VALUES (?, ?, 'UNLOCK_TILE', 'Administrator odblokował kafelek')
                `,
                [tileId, req.user.id],
                () => {}
            );

            res.json({
                success: true,
                message: "Kafelek odblokowany"
            });
        }
    );
});

router.post("/rename-tile/:id", auth, (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({
            success:false,
            message:"Brak uprawnień administratora"
        });
    }

    const tileId = req.params.id;
    const { tileName } = req.body;

    db.run(
        `
        UPDATE tiles
        SET tile_name = ?
        WHERE id = ?
        `,
        [
            tileName?.trim() || null,
            tileId
        ],
        function(err){
            if(err){
                return res.status(500).json({
                    success:false,
                    message:"Nie udało się zmienić nazwy"
                });
            }

            res.json({
                success:true,
                message:"Nazwa kafelka została zmieniona"
            });
        }
    );
});

router.get("/", (req, res) => {
    db.all(
        `
        SELECT
                tiles.id,
                tiles.taken,
                tiles.takenby,
                tiles.takenat,
                tiles.screenshot_url,
                tiles.tile_name,
                users.nickname
        FROM tiles
        LEFT JOIN users ON users.id = tiles.takenby
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
    const { screenshotUrl } = req.body;

    if (!screenshotUrl || screenshotUrl.trim() === "") {
        return res.status(400).json({
            success: false,
            message: "Musisz podać link do screenshota"
        });
    }

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
                    takenby = ?,
                    takenat = NOW(),
                    screenshot_url = ?
                WHERE id = ?
                `,
                [
                    req.user.id,
                    screenshotUrl.trim(),
                    tileId
                ],
                function(err) {
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: "Błąd zapisu kafelka"
                        });
                    }

                    db.run(
                        `
                        INSERT INTO tile_history (tile_id, user_id, action, note)
                        VALUES (?, ?, 'TAKE_TILE', 'Użytkownik zajął kafelek')
                        `,
                        [tileId, req.user.id],
                        () => {}
                    );

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