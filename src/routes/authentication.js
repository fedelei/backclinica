import express from "express";
const router = express.Router();

import passport from "passport";
import pool from "../database.js";
import jwt from "jsonwebtoken";

/* router.all('*', function(req, res, next){
    res.header("Access-Control-Allow-Origin", "*")
    res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    res.header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept")
    res.header("Access-Control-Max-Age", "1728000")
    next();
}); */






//// Registro
router.post('/signupcl', (req, res, next) => {

    passport.authenticate(
        'local.signupcl',
        { session: false },
        (err, user, info) => {

            if (err) {
                console.error(err);
                return res.status(500).json({
                    message: 'Error del servidor.'
                });
            }

            if (!user) {
                return res.status(400).json({
                    message: info?.message || 'Registro fallido.'
                });
            }

            const userForToken = {
                id: Number(user.id),
                usuario: user.usuario,
                nivel: Number(user.nivel),
                rol: user.rol,
                medico: user.medico,
                id_clinica: user.id_clinica
            };

            const token = jwt.sign(
                userForToken,
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.status(201).json({
                message: 'Registrado exitosamente.',
                user: {
                    id: Number(user.id),
                    usuario: user.usuario,
                    nombre: user.nombre,
                    apellido: user.apellido,
                    nivel: Number(user.nivel),
                    rol: user.rol,
                    medico: user.medico,
                    id_clinica: user.id_clinica
                },
                token
            });
        }
    )(req, res, next);
});





router.post(
    '/signincl',
    (req, res, next) => {
        console.log("➡️ POST /signincl BODY:", req.body);
        next();
    },
    passport.authenticate('local.signincli', {
        session: false
    }),
    (req, res) => {

        const userForToken = {
            id: req.user.id,
            usuario: req.user.usuario,
            nivel: req.user.nivel
        };

        const token = jwt.sign(
            userForToken,
            process.env.JWT_SECRET,
            {
                expiresIn: '7d'
            }
        );

        res.json({
            id: req.user.id,
            usuario: req.user.usuario,
            nivel: req.user.nivel,
            token
        });
    }
);

///////////

router.get('/traerusuario/:cuil_cuit', async(req,res)=>{
   const cuil_cuit = req.params.cuil_cuit
    const usuario = await pool.query('select * from users where cuil_cuit= ? ',[cuil_cuit])
    res.json(usuario)
    

})

router.get('/exitosignup',(req,res)=>{
    console.log('registrado')
    res.json('Registrado exitosamente!')
})

router.get('/noexito',(req,res)=>{
 
    
    res.send('Sin Exito')
})




//  ACCIONES NIVEL 3

router.post('/agregarunusuario',passport.authenticate('local.signupnivel3', {
    successRedirect: '/exitosignup',
    failureRedirect:'/signup',
    failureFlash:true

}))


router.get('/prueba',async(req,res)  =>{
    /*const { cuil_cuit, algo, token } = req.body;*/
    console.log('hola')
   
   rows = await pool.query ('select * from clientes ')
  
    
res.json(rows)





})

export default router;