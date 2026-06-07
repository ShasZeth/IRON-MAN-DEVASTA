const db = require("./database/db");

const adminNickname = process.env.ADMIN_NICKNAME || "Admin";

db.run(
    `
    UPDATE users
    SET isadmin = 1
    WHERE nickname = ?
    `,
    [adminNickname],
    function(err){
        if(err){
            console.error("Błąd nadawania administratora:");
            console.error(err);
            process.exit(1);
        }

        if(this.changes === 0){
            console.log(
                `Nie znaleziono użytkownika "${adminNickname}".`
            );
            process.exit(0);
        }

        console.log(
            `Użytkownik "${adminNickname}" otrzymał uprawnienia administratora.`
        );

        process.exit(0);
    }
);