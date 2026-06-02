const db = require("./database/db");

db.run(
    "UPDATE users SET isAdmin = 1 WHERE nickname = ?",
    ["Admin"],
    function(err) {

        if (err) {
            console.error(err);
        } else {
            console.log("Admin otrzymał uprawnienia administratora.");
        }

        db.close();
    }
);