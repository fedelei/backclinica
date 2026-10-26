import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import pool from "../database.js";
import helpers from "../lib/helpers.js";

// =====================================================
// LOGIN
// =====================================================

passport.use(
    "local.signincli",
    new LocalStrategy(
        {
            usernameField: "usuario",
            passwordField: "password",
            passReqToCallback: true,
        },
        async (req, usuario, password, done) => {
            try {
                const rows = await pool.query(
                    "SELECT * FROM usuarios WHERE usuario = ?",
                    [usuario]
                );

                if (rows.length === 0) {
                    return done(null, false, {
                        message: "Usuario o contraseña incorrectos",
                    });
                }

                const user = rows[0];

                const validPassword = await helpers.matchPassword(
                    password,
                    user.password
                );

                if (!validPassword) {
                    return done(null, false, {
                        message: "Usuario o contraseña incorrectos",
                    });
                }

                // Obtener el ID de la clínica
                const id_clinica = user.id_clinica;

                console.log("ID de la clínica:", id_clinica);

                // Agregarlo al objeto del usuario
                user.id_clinica = id_clinica;

                return done(null, user);

            } catch (error) {
                console.error("Error en local.signincli:", error);
                return done(error);
            }
        }
    )
);


// =====================================================
// REGISTRO DE USUARIOS
// =====================================================

passport.use(
    "local.signupcl",
    new LocalStrategy(
        {
            usernameField: "usuario",
            passwordField: "password",
            passReqToCallback: true,
        },
        async (req, usuario, password, done) => {
            try {
                // Recibir los datos del formulario
                let { nombre, nivel, rol, id_clinica, apellido } = req.body;

                // Nivel predeterminado
                if (nivel === undefined) {
                    nivel = 1;
                }

                // Validar que se proporcione id_clinica
                if (!id_clinica) {
                    return done(null, false, {
                        message: "El campo id_clinica es obligatorio",
                    });
                }

                // Determinar si es médico según el rol
                const medico = rol === "Administrador" ? "No" : "Si";

                // Verificar si el usuario ya existe
                const verif = await pool.query(
                    "SELECT * FROM usuarios WHERE usuario = ?",
                    [usuario]
                );

                if (verif.length > 0) {
                    return done(null, false, {
                        message: "El usuario ya existe",
                    });
                }

                // Encriptar contraseña
                const encryptedPassword =
                    await helpers.encryptPassword(password);

                // Insertar usuario incluyendo el campo medico e id_clinica
                const result = await pool.query(
                    `INSERT INTO usuarios
                    SET password = ?, usuario = ?, nombre = ?, apellido = ?,
                        nivel = ?, medico = ?, id_clinica = ?`,
                    [
                        encryptedPassword,
                        usuario,
                        nombre,
                        apellido || null,
                        nivel,
                        medico,
                        id_clinica,
                    ]
                );

                // Datos del nuevo usuario
                const newUser = {
                    id: Number(result.insertId),
                    usuario,
                    nombre,
                    apellido: apellido || null,
                    nivel: Number(nivel),
                    rol,
                    medico,
                    id_clinica: Number(id_clinica),
                };

                return done(null, newUser);

            } catch (error) {
                console.error("Error en local.signupcl:", error);
                return done(error);
            }
        }
    )
);
 
