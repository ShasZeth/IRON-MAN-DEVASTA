const express = require("express");
const db = require("../database/db");
const auth = require("../middleware/auth");

const router = express.Router();

router.use((req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    next();
});

function getBoardLockStatus(callback){
    db.get(
        `
        SELECT value AS unlock_at
        FROM app_settings
        WHERE key = 'board_locked_until'
        `,
        [],
        (err, row) => {
            if(err){
                return callback(err);
            }

            const unlockAt = row && row.unlock_at ? row.unlock_at : null;
            const locked = unlockAt && new Date(unlockAt).getTime() > Date.now();

            callback(null, {
                locked: !!locked,
                unlock_at: locked ? unlockAt : null
            });
        }
    );
}

function isRegularTile(tile){
    return !(tile.is_special === 1 || tile.is_special === true);
}

function getOptionalUserFromToken(req){
    const authHeader = req.headers.authorization || "";

    if(!authHeader.startsWith("Bearer ")){
        return null;
    }

    const token = authHeader.split(" ")[1];

    if(!token){
        return null;
    }

    try{
        const jwt = require("jsonwebtoken");
        return jwt.verify(token, process.env.JWT_SECRET);
    }catch(error){
        return null;
    }
}

function isRequestAdmin(req){
    const user = getOptionalUserFromToken(req);
    return !!(user && user.isAdmin);
}

function getPublicTile(tile, boardLock){
    return {
        id: tile.id,
        tile_number: tile.tile_number,
        taken: tile.taken,
        takenby: tile.takenby,
        takenat: tile.takenat,
        screenshot_url: tile.screenshot_url,
        points: tile.points,
        is_special: tile.is_special,
        special_number: tile.special_number,
        unlock_at: tile.unlock_at,
        tile_name: tile.tile_name,
        nickname: tile.nickname,
        bonus_points: tile.bonus_points,
        admin_bonus_points: tile.admin_bonus_points,
        admin_penalty_points: tile.admin_penalty_points,
        board_lock: boardLock.locked ? boardLock : null
    };
}

function getHiddenSpecialTile(tile, boardLock){
    return {
        id: tile.id,
        is_special: 1,
        special_number: tile.special_number,
        taken: 0,
        unlock_at: tile.unlock_at,
        is_locked: 1,
        board_lock: boardLock.locked ? boardLock : null
    };
}

function getHiddenBoardTile(tile, boardLock){
    return {
        id: tile.id,
        tile_number: tile.tile_number,
        is_special: 0,
        taken: 0,
        is_board_locked: 1,
        board_lock: boardLock
    };
}



router.get("/board-lock/status", (req, res) => {
    getBoardLockStatus((err, status) => {
        if(err){
            console.error("BOARD LOCK STATUS ERROR:", err);
            return res.status(500).json({
                message:"Błąd pobierania blokady tablicy."
            });
        }

        res.json(status);
    });
});

router.post("/board-lock", auth, (req, res) => {
    if(!req.user.isAdmin){
        return res.status(403).json({
            message:"Brak uprawnień administratora."
        });
    }

    const { lockMinutes } = req.body;
    const cleanMinutes = Number(lockMinutes || 0);

    if(!Number.isInteger(cleanMinutes) || cleanMinutes < 1){
        return res.status(400).json({
            message:"Czas blokady musi być liczbą minut większą od 0."
        });
    }

    const unlockAt = new Date(Date.now() + cleanMinutes * 60 * 1000).toISOString();

    db.run(
        `
        INSERT INTO app_settings (key, value)
        VALUES ('board_locked_until', ?)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `,
        [unlockAt],
        function(err){
            if(err){
                console.error("BOARD LOCK SAVE ERROR:", err);
                return res.status(500).json({
                    message:"Błąd blokowania tablicy."
                });
            }

            res.json({
                message:`Tablica została zablokowana na ${cleanMinutes} min.`,
                unlock_at:unlockAt
            });
        }
    );
});

router.post("/board-unlock", auth, (req, res) => {
    if(!req.user.isAdmin){
        return res.status(403).json({
            message:"Brak uprawnień administratora."
        });
    }

    db.run(
        `
        UPDATE app_settings
        SET value = NULL
        WHERE key = 'board_locked_until'
        `,
        [],
        function(err){
            if(err){
                console.error("BOARD UNLOCK ERROR:", err);
                return res.status(500).json({
                    message:"Błąd odblokowania tablicy."
                });
            }

            res.json({
                message:"Tablica została odblokowana."
            });
        }
    );
});

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
})

router.post("/points/:id", auth, (req, res) => {

    if (!req.user.isAdmin) {
        return res.status(403).json({
            success:false,
            message:"Brak uprawnień administratora"
        });
    }

    const tileId = req.params.id;
    const { points } = req.body;

    const cleanPoints = Number(points);

    if (!Number.isInteger(cleanPoints) || cleanPoints < 0) {
        return res.status(400).json({
            success:false,
            message:"Punkty muszą być liczbą całkowitą większą lub równą 0"
        });
    }

    db.run(
        `
        UPDATE tiles
        SET points = ?
        WHERE id = ?
        `,
        [cleanPoints, tileId],
        function(err){
            if(err){
                return res.status(500).json({
                    success:false,
                    message:"Nie udało się zmienić punktów"
                });
            }

            res.json({
                success:true,
                message:"Punkty kafelka zostały zmienione"
            });
        }
    );
});

router.patch("/:id", auth, (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({
            success:false,
            message:"Brak uprawnień administratora"
        });
    }

    const tileId = req.params.id;
    const { tileName, points, isSpecial, isLocked, unlockMinutes } = req.body;

    const cleanPoints = Number(points);

    if (!Number.isInteger(cleanPoints) || cleanPoints < 0) {
        return res.status(400).json({
            success:false,
            message:"Punkty muszą być liczbą całkowitą większą lub równą 0"
        });
    }

    db.run(
        `
        UPDATE tiles
        SET tile_name = ?,
            points = ?
        WHERE id = ?
        `,
        [
            tileName?.trim() || "",
            cleanPoints,
            tileId
        ],
        function(err){
            if(err){
                return res.status(500).json({
                    success:false,
                    message:"Nie udało się edytować kafelka"
                });
            }

            res.json({
                success:true,
                message:"Kafelek został zapisany"
            });
        }
    );
});

router.post("/users/bonus-points", auth, (req, res) => {
    if(!req.user.isAdmin){
        return res.status(403).json({
            message:"Brak uprawnień administratora."
        });
    }

    const { nickname, adminBonusPoints, adminPenaltyPoints, bonusPoints } = req.body;

    if(!nickname){
        return res.status(400).json({
            message:"Brak nazwy użytkownika."
        });
    }

    let cleanAdminBonus = Number(adminBonusPoints || 0);
    let cleanAdminPenalty = Number(adminPenaltyPoints || 0);

    /*
        Kompatybilność ze starszym frontendem:
        jeśli kiedyś wysyłaliśmy tylko bonusPoints jako jedną wartość,
        rozbijamy ją na premię albo karę.
    */
    if(adminBonusPoints === undefined && adminPenaltyPoints === undefined && bonusPoints !== undefined){
        const legacyPoints = Number(bonusPoints);

        if(!Number.isInteger(legacyPoints)){
            return res.status(400).json({
                message:"Punkty muszą być liczbą całkowitą."
            });
        }

        cleanAdminBonus = Math.max(legacyPoints, 0);
        cleanAdminPenalty = Math.abs(Math.min(legacyPoints, 0));
    }

    if(!Number.isInteger(cleanAdminBonus) || cleanAdminBonus < 0){
        return res.status(400).json({
            message:"Premia administratora musi być liczbą całkowitą większą lub równą 0."
        });
    }

    if(!Number.isInteger(cleanAdminPenalty) || cleanAdminPenalty < 0){
        return res.status(400).json({
            message:"Kara punktowa musi być liczbą całkowitą większą lub równą 0."
        });
    }

    const legacyNetPoints = cleanAdminBonus - cleanAdminPenalty;

    db.run(
        `
        UPDATE users
        SET admin_bonus_points = ?,
            admin_penalty_points = ?,
            bonus_points = ?
        WHERE nickname = ?
        `,
        [cleanAdminBonus, cleanAdminPenalty, legacyNetPoints, nickname],
        function(err){
            if(err){
                console.error("ADMIN POINTS UPDATE ERROR:", err);

                return res.status(500).json({
                    message:"Błąd zapisu punktów administratora."
                });
            }

            return res.json({
                message:"Punkty administratora zostały zapisane."
            });
        }
    );
});

router.post("/create", auth, (req, res) => {
    if(!req.user.isAdmin){
        return res.status(403).json({
            message:"Brak uprawnień administratora."
        });
    }

    const { tileName, points, isSpecial, isLocked, unlockMinutes } = req.body;

    const parsedPoints = Number(points || 0);
    const specialFlag = isSpecial ? 1 : 0;
    const lockedFlag = specialFlag && isLocked ? 1 : 0;
    const cleanUnlockMinutes = Number(unlockMinutes || 0);

    if(!Number.isInteger(parsedPoints) || parsedPoints < 0){
        return res.status(400).json({
            message:"Punkty muszą być liczbą całkowitą większą lub równą 0."
        });
    }

    if(lockedFlag && (!Number.isInteger(cleanUnlockMinutes) || cleanUnlockMinutes < 1)){
        return res.status(400).json({
            message:"Czas odblokowania musi być liczbą minut większą od 0."
        });
    }

    const unlockAt = lockedFlag
        ? new Date(Date.now() + cleanUnlockMinutes * 60 * 1000)
        : null;

    db.get(
        `
        SELECT COALESCE(MAX(id), 0) + 1 AS next_id
        FROM tiles
        `,
        [],
        (err, idRow) => {
            if(err){
                console.error("CREATE TILE MAX ID ERROR:", err);
                return res.status(500).json({
                    message:"Błąd tworzenia kafelka."
                });
            }

            db.get(
                `
                SELECT COALESCE(MAX(tile_number), 0) + 1 AS next_tile_number
                FROM tiles
                WHERE COALESCE(is_special, 0) = 0
                `,
                [],
                (err, tileRow) => {
                    if(err){
                        console.error("CREATE TILE MAX TILE NUMBER ERROR:", err);
                        return res.status(500).json({
                            message:"Błąd tworzenia kafelka."
                        });
                    }

                    db.get(
                        `
                        SELECT COALESCE(MAX(special_number), 0) + 1 AS next_special_number
                        FROM tiles
                        WHERE COALESCE(is_special, 0) = 1
                        `,
                        [],
                        (err, specialRow) => {
                            if(err){
                                console.error("CREATE TILE MAX SPECIAL NUMBER ERROR:", err);
                                return res.status(500).json({
                                    message:"Błąd tworzenia kafelka."
                                });
                            }

                            const nextId = idRow.next_id;

                            const nextTileNumber = specialFlag
                                ? null
                                : tileRow.next_tile_number;

                            const nextSpecialNumber = specialFlag
                                ? specialRow.next_special_number
                                : null;

                            db.run(
                                `
                                INSERT INTO tiles (
                                    id,
                                    tile_number,
                                    taken,
                                    tile_name,
                                    points,
                                    is_special,
                                    special_number,
                                    unlock_at
                                )
                                VALUES (?, ?, 0, ?, ?, ?, ?, ?)
                                `,
                                [
                                    nextId,
                                    nextTileNumber,
                                    tileName ? tileName.trim() : "",
                                    parsedPoints,
                                    specialFlag,
                                    nextSpecialNumber,
                                    unlockAt
                                ],
                                function(err){
                                    if(err){
                                        console.error("CREATE TILE ERROR:", err);
                                        return res.status(500).json({
                                            message:"Błąd tworzenia kafelka."
                                        });
                                    }

                                    res.json({
                                        message: specialFlag
                                            ? (lockedFlag
                                                ? `Utworzono ukryty kafelek bonusowy #${nextSpecialNumber}.`
                                                : `Utworzono kafelek bonusowy #${nextSpecialNumber}.`)
                                            : `Utworzono kafelek #${nextTileNumber}.`
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});


router.get("/admin/all", auth, (req, res) => {
    if(!req.user.isAdmin){
        return res.status(403).json({
            message:"Brak uprawnień administratora."
        });
    }

    getBoardLockStatus((lockErr, boardLock) => {
        if(lockErr){
            console.error("LOAD ADMIN BOARD LOCK ERROR:", lockErr);
            return res.status(500).json({
                message:"Błąd pobierania blokady tablicy."
            });
        }

        db.all(
            `
            SELECT 
                tiles.*,
                users.nickname,
                COALESCE(users.bonus_points, 0) AS bonus_points,
                COALESCE(users.admin_bonus_points, 0) AS admin_bonus_points,
                COALESCE(users.admin_penalty_points, 0) AS admin_penalty_points
            FROM tiles
            LEFT JOIN users ON users.id = tiles.takenby
            ORDER BY tiles.id
            `,
            [],
            (err, rows) => {
                if(err){
                    console.error("LOAD ADMIN TILES ERROR:", err);
                    return res.status(500).json({
                        message:"Błąd pobierania kafelków."
                    });
                }

                const result = rows.map(tile => ({
                    ...tile,
                    board_lock: boardLock.locked ? boardLock : null,
                    is_board_locked: boardLock.locked && isRegularTile(tile) && !tile.taken ? 1 : 0
                }));

                res.json(result);
            }
        );
    });
});
router.get("/ranking/points", (req, res) => {
    db.all(
        `
        SELECT 
            users.id,
            users.nickname,
            COALESCE(users.admin_bonus_points, 0) AS admin_bonus_points,
            COALESCE(users.admin_penalty_points, 0) AS admin_penalty_points,
            COALESCE(SUM(CASE WHEN COALESCE(tiles.is_special, 0) = 0 THEN tiles.points ELSE 0 END), 0) AS tile_points,
            COALESCE(SUM(CASE WHEN COALESCE(tiles.is_special, 0) = 1 THEN tiles.points ELSE 0 END), 0) AS bounty_points,
            COALESCE(SUM(tiles.points), 0)
                + COALESCE(users.admin_bonus_points, 0)
                - COALESCE(users.admin_penalty_points, 0) AS total_points
        FROM users
        LEFT JOIN tiles ON tiles.takenby = users.id AND tiles.taken = 1
        GROUP BY users.id, users.nickname, users.admin_bonus_points, users.admin_penalty_points
        ORDER BY total_points DESC
        `,
        [],
        (err, rows) => {
            if(err){
                console.error("RANKING POINTS ERROR:", err);
                return res.status(500).json({
                    message:"Błąd pobierania rankingu punktowego."
                });
            }

            res.json(rows);
        }
    );
});

router.get("/", (req, res) => {
    const requestIsAdmin = isRequestAdmin(req);

    getBoardLockStatus((lockErr, boardLock) => {
        if(lockErr){
            console.error("LOAD BOARD LOCK ERROR:", lockErr);
            return res.status(500).json({
                message:"Błąd pobierania blokady tablicy."
            });
        }

        db.all(
            `
            SELECT 
                tiles.*,
                users.nickname,
                COALESCE(users.bonus_points, 0) AS bonus_points,
                COALESCE(users.admin_bonus_points, 0) AS admin_bonus_points,
                COALESCE(users.admin_penalty_points, 0) AS admin_penalty_points
            FROM tiles
            LEFT JOIN users ON users.id = tiles.takenby
            ORDER BY tiles.id
            `,
            [],
            (err, rows) => {
                if(err){
                    console.error("LOAD TILES ERROR:", err);
                    return res.status(500).json({
                        message:"Błąd pobierania kafelków."
                    });
                }

                const now = Date.now();

                const safeRows = rows.map(tile => {
                    const isSpecial = tile.is_special === 1 || tile.is_special === true;

                    const isSpecialLocked =
                        isSpecial &&
                        tile.unlock_at &&
                        new Date(tile.unlock_at).getTime() > now;

                    /*
                        SECURITY:
                        - Admin can see everything through /admin/all.
                        - Public /api/tiles must never leak hidden task data.
                        - Normal users receive only minimal placeholders for locked tasks.
                    */

                    if(!requestIsAdmin && isSpecialLocked){
                        return getHiddenSpecialTile(tile, boardLock);
                    }

                    if(!requestIsAdmin && boardLock.locked && !isSpecial && !tile.taken){
                        return getHiddenBoardTile(tile, boardLock);
                    }

                    return getPublicTile(tile, boardLock);
                });

                res.json(safeRows);
            }
        );
    });
});
router.delete("/:id", auth, (req, res) => {

    if (!req.user.isAdmin) {
        return res.status(403).json({
            success:false,
            message:"Brak uprawnień administratora"
        });
    }

    const tileId = req.params.id;

    db.run(
        `
        DELETE FROM tiles
        WHERE id = ?
        `,
        [tileId],
        function(err){

            if(err){
                return res.status(500).json({
                    success:false,
                    message:"Nie udało się usunąć kafelka"
                });
            }

            res.json({
                success:true,
                message:"Kafelek został usunięty"
            });
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

            if (
                tile.is_special &&
                tile.unlock_at &&
                new Date(tile.unlock_at).getTime() > Date.now()
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Ten Bounty Bonus nie jest jeszcze odblokowany"
                });
            }

            getBoardLockStatus((lockErr, boardLock) => {
                if(lockErr){
                    console.error("CLAIM BOARD LOCK ERROR:", lockErr);
                    return res.status(500).json({
                        success:false,
                        message:"Błąd sprawdzania blokady tablicy"
                    });
                }

                if(boardLock.locked && isRegularTile(tile)){
                    return res.status(400).json({
                        success:false,
                        message:"Tablica jest aktualnie zablokowana"
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
                AND taken = 0
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
            });
        }
    );
});

module.exports = router;