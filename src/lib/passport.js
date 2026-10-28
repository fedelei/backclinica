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
                let { nombre, nivel, rol, id_clinica, apellido, especialidad } = req.body;

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

                // Si es profesional, especialidad es obligatoria
                if (medico === "Si" && (!especialidad || !especialidad.trim())) {
                    return done(null, false, {
                        message: "El campo especialidad es obligatorio para profesionales",
                    });
                }

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
                        nivel = ?, medico = ?, id_clinica = ?, rol = ?`,
                    [
                        encryptedPassword,
                        usuario,
                        nombre,
                        apellido || null,
                        nivel,
                        medico,
                        id_clinica,
                        rol,
                    ]
                );

                const newUserId = Number(result.insertId);

                // Crear registro en tabla trabajo (relación usuario-clínica)
                // Esto es necesario para que el profesional aparezca en la clínica
                try {
                    await pool.query(
                        `INSERT INTO trabajo (id_usuario, id_clinica) VALUES (?, ?)`,
                        [newUserId, id_clinica]
                    );
                } catch (trabajoError) {
                    console.error('Error al crear registro en trabajo:', trabajoError);
                    // No fallamos el registro si falla trabajo, pero lo logeamos
                }

                // Si se proporcionó especialidad, crear la relación
                if (especialidad && especialidad.trim()) {
                    try {
                        // Buscar si la especialidad ya existe en la clínica (case-insensitive)
                        const especialidadExistente = await pool.query(
                            `SELECT id FROM especialidades 
                             WHERE LOWER(nombre) = LOWER(?) AND id_clinica = ?`,
                            [especialidad.trim(), id_clinica]
                        );

                        let especialidadId;
                        if (especialidadExistente.length > 0) {
                            especialidadId = especialidadExistente[0].id;
                            console.log('Reutilizando especialidad existente, ID:', especialidadId);
                        } else {
                            // Crear nueva especialidad
                            const resultadoEspecialidad = await pool.query(
                                `INSERT INTO especialidades (nombre, id_clinica) VALUES (?, ?)`,
                                [especialidad.trim(), id_clinica]
                            );
                            especialidadId = resultadoEspecialidad.insertId;
                            console.log('Nueva especialidad creada, ID:', especialidadId);
                        }

                        // Verificar si ya existe la relación para evitar duplicados
                        const relacionExistente = await pool.query(
                            `SELECT * FROM especializacion 
                             WHERE id_medico = ? AND id_especialidad = ?`,
                            [newUserId, especialidadId]
                        );

                        if (relacionExistente.length === 0) {
                            await pool.query(
                                `INSERT INTO especializacion (id_medico, id_especialidad) VALUES (?, ?)`,
                                [newUserId, especialidadId]
                            );
                            console.log('Relación especializacion creada');
                        } else {
                            console.log('Relación especializacion ya existe');
                        }
                    } catch (especialidadError) {
                        console.error('Error al crear especialidad:', especialidadError);
                        // Loguear el error pero no fallar el registro
                        // Sin embargo, el profesional no tendrá especialidad
                    }
                }

                // Datos del nuevo usuario
                const newUser = {
                    id: newUserId,
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
 
