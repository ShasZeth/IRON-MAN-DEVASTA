const jwt = require("jsonwebtoken");

if(!process.env.JWT_SECRET){
    throw new Error("JWT_SECRET nie został ustawiony w zmiennych środowiskowych.");
}

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if(!authHeader || !authHeader.startsWith("Bearer ")){
        return res.status(401).json({
            success:false,
            message:"Brak tokenu"
        });
    }

    try{
        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = decoded;
        next();

    }catch(err){
        return res.status(401).json({
            success:false,
            message:"Nieprawidłowy token"
        });
    }
};