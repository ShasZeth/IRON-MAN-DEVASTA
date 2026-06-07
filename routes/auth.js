const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../database/db");

const router = express.Router();

if(!process.env.JWT_SECRET){
    throw new Error("JWT_SECRET nie został ustawiony w zmiennych środowiskowych.");
}

function cleanNickname(value){
    return String(value || "").trim();
}

function isValidNickname(nickname){
    return /^[a-zA-Z0-9_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ -]{3,30}$/.test(nickname);
}

function isValidPassword(password){
    return typeof password === "string" && password.length >= 6 && password.length <= 100;
}

router.post("/register", async (req, res) => {
    const nickname = cleanNickname(req.body.nickname);
    const { password } = req.body;

    if(!nickname || !password){
        return res.status(400).json({
            success:false,
            message:"Podaj nickname i hasło"
        });
    }

    if(!isValidNickname(nickname)){
        return res.status(400).json({
            success:false,
            message:"Nickname musi mieć 3-30 znaków i może zawierać litery, cyfry, spacje, myślnik oraz podkreślenie."
        });
    }

    if(!isValidPassword(password)){
        return res.status(400).json({
            success:false,
            message:"Hasło musi mieć od 6 do 100 znaków."
        });
    }

    try{
        const hashedPassword = await bcrypt.hash(password, 12);

        db.run(
            `
            INSERT INTO users (nickname, password, isadmin)
            VALUES (?, ?, 0)
            RETURNING id
            `,
            [nickname, hashedPassword],
            function(err){
                if(err){
                    return res.status(400).json({
                        success:false,
                        message:"Nickname jest już zajęty"
                    });
                }

                return res.json({
                    success:true,
                    userId:this.lastID
                });
            }
        );

    }catch(error){
        console.error("REGISTER ERROR:", error);

        return res.status(500).json({
            success:false,
            message:"Błąd serwera"
        });
    }
});

router.post("/login", (req, res) => {
    const nickname = cleanNickname(req.body.nickname);
    const { password } = req.body;

    if(!nickname || !password){
        return res.status(400).json({
            success:false,
            message:"Podaj nickname i hasło"
        });
    }

    db.get(
        `
        SELECT id, nickname, password, isadmin
        FROM users
        WHERE nickname = ?
        `,
        [nickname],
        async (err, user) => {
            if(err){
                console.error("LOGIN DB ERROR:", err);

                return res.status(500).json({
                    success:false,
                    message:"Błąd serwera"
                });
            }

            if(!user){
                return res.status(401).json({
                    success:false,
                    message:"Nieprawidłowy login lub hasło"
                });
            }

            const validPassword = await bcrypt.compare(password, user.password);

            if(!validPassword){
                return res.status(401).json({
                    success:false,
                    message:"Nieprawidłowy login lub hasło"
                });
            }

            const token = jwt.sign(
                {
                    id:user.id,
                    nickname:user.nickname,
                    isAdmin:user.isadmin === 1 || user.isadmin === true
                },
                process.env.JWT_SECRET,
                {
                    expiresIn:"7d"
                }
            );

            return res.json({
                success:true,
                token
            });
        }
    );
});

module.exports = router;
