
import express from "express";
import dotenv from "dotenv";
const router = express.Router();
import cron from "node-cron";
import { } from "../lib/auth.js";
import pool from "../database.js";
import {
  isLoggedInncli,

} from "../lib/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import passport from "passport";
import jwt from "jsonwebtoken";

import {
    autenticarToken,
    autenticarTokenOpcional,
    obtenerHashToken
} from "../middlewares/autenticarToken.js";

/* 

router.get('/', async (req, res) => {

}) */



/* router.get('/clinicas', async (req, res) => {

///await pool.query

  res.json(
	[
 	  { 
                "id": 1, 
                "nombre": "Clínica Central", 
                "direccion": "Av. Rivadavia 4500", 
                "localidad": "CABA", 
               "telefono": "011-4901-2233" 
              }
          ]
);

}) */
//traer clinicas
router.get('/clinicas', async (req, res) => {
  try {
    const clinicas = await pool.query(`
      SELECT 
        id,
        nombre,
        direccion,
        localidad,
        telefono
      FROM clinicas
      ORDER BY nombre ASC
    `);

    res.json(clinicas);

  } catch (error) {
    console.error('Error al obtener las clínicas:', error);

    res.status(500).json({
      message: 'Error al obtener las clínicas',
      error: error.message
    });
  }
});


//////v1/clinicas/1/especialidades
router.get('/clinicas/:id/especialidades', async (req, res) => {
  const id_usuario = req.params.id;

  try {
    const especialidades = await pool.query(`
      SELECT DISTINCT
        e.id,
        e.nombre
      FROM especialidades e
      INNER JOIN trabajo t
        ON t.id_clinica COLLATE utf8mb4_general_ci =
           e.id_clinica COLLATE utf8mb4_general_ci
      WHERE t.id_usuario = ?
      ORDER BY e.nombre ASC
    `, [id_usuario]);

    res.json(especialidades);

  } catch (error) {
    console.error('Error al obtener las especialidades:', error);

    res.status(500).json({
      message: 'Error al obtener las especialidades',
      error: error.message
    });
  }
});


http://localhost:4000/vl/profesionales?clinicaId=2&especialidad=Dermatologia
/* router.get('/profesionales', async (req, res) => {
  try {
    const { clinicaId, especialidad } = req.query;

    if (!clinicaId || !especialidad) {
      return res.status(400).json({
        error: 'Los parámetros clinicaId y especialidad son obligatorios'
      });
    }

    const profesionales = await pool.query(
      `SELECT DISTINCT
          u.id,
          u.nombre,
          u.apellido,
          e.nombre AS especialidad
       FROM usuarios u
       INNER JOIN especializacion esp
          ON esp.id_medico = u.id
       INNER JOIN especialidades e
          ON e.id = esp.id_especialidad
       WHERE u.medico = 'Si'
         AND u.id_clinica = ?
         AND e.id_clinica = u.id_clinica
         AND e.nombre = ?`,
      [clinicaId, especialidad]
    );

    res.status(200).json(profesionales);

  } catch (error) {
    console.error('Error al obtener profesionales:', error);

    res.status(500).json({
      error: 'Error al obtener los profesionales'
    });
  }
}); */




////http://localhost:4000/vl/profesionales?clinicaId=2&especialidad=Cardiologia
//// Endpoint público — parte del flujo de solicitud de turnos (pacientes sin auth).
//// El equivalente autenticado para admin es GET /v1/clinicas/:clinicId/profesionales.
router.get('/profesionales', async (req, res) => {
  try {
    const { clinicaId, especialidad } = req.query;

    if (!clinicaId || !especialidad) {
      return res.status(400).json({
        error: 'Los parámetros clinicaId y especialidad son obligatorios'
      });
    }

    const profesionales = await pool.query(
      `
      SELECT DISTINCT
          u.id,
          u.nombre,
          u.apellido,
          e.nombre AS especialidad
      FROM trabajo t

      INNER JOIN usuarios u
          ON CAST(u.id AS CHAR) COLLATE utf8mb4_general_ci =
             CAST(t.id_usuario AS CHAR) COLLATE utf8mb4_general_ci

      INNER JOIN especializacion esp
          ON CAST(esp.id_medico AS CHAR) COLLATE utf8mb4_general_ci =
             CAST(u.id AS CHAR) COLLATE utf8mb4_general_ci

      INNER JOIN especialidades e
          ON CAST(e.id AS CHAR) COLLATE utf8mb4_general_ci =
             CAST(esp.id_especialidad AS CHAR) COLLATE utf8mb4_general_ci

      WHERE t.id_clinica = ?
        AND u.medico = 'Si'
        AND e.nombre COLLATE utf8mb4_general_ci =
            CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci

      ORDER BY u.apellido ASC, u.nombre ASC
      `,
      [clinicaId, especialidad]
    );

    return res.status(200).json(profesionales);

  } catch (error) {
    console.error('Error al obtener profesionales:', error);

    return res.status(500).json({
      error: 'Error al obtener los profesionales'
    });
  }
});



////http://localhost:4000/vl/profesionales/2/fechas-disponibles?mes=2026-10
router.get('/profesionales/:profesionalId/fechas-disponibles', async (req, res) => {
  try {
    const { profesionalId } = req.params;
    const mes = req.query.mes || new Date().toISOString().slice(0, 7);

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      return res.status(400).json({
        error: 'El parámetro mes debe tener formato YYYY-MM'
      });
    }

    // Obtener la configuración base del profesional (nuevo sistema)
    const horariosBase = await pool.query(
      `SELECT DISTINCT dia
       FROM horarios_base
       WHERE usuario_id = ? AND activo = true`,
      [profesionalId]
    );

    // Si tiene configuración personal, usar esos días
    // Si no, usar configuración por defecto: Lunes-Viernes (1-5)
    const diasLaborales = new Set(
      horariosBase.length > 0
        ? horariosBase.map(h => Number(h.dia))
        : [1, 2, 3, 4, 5] // L-V por defecto
    );

    // Obtener excepciones para el mes (bloqueos totales del día)
    const [anio, numeroMes] = mes.split('-').map(Number);
    const primerDiaMes = `${anio}-${String(numeroMes).padStart(2, '0')}-01`;
    const ultimoDiaMes = `${anio}-${String(numeroMes).padStart(2, '0')}-31`;

    const excepciones = await pool.query(
      `SELECT fecha
       FROM horarios_excepciones
       WHERE usuario_id = ?
         AND fecha >= ?
         AND fecha <= ?
         AND (hora_inicio IS NULL OR hora_fin IS NULL)`,
      [profesionalId, primerDiaMes, ultimoDiaMes]
    );

    // Crear set de fechas bloqueadas
    const fechasBloqueadas = new Set(
      excepciones.map(e => e.fecha)
    );

    const ultimoDia = new Date(anio, numeroMes, 0).getDate();

    const fechasDisponibles = [];

    for (let dia = 1; dia <= ultimoDia; dia++) {
      const fechaStr = `${anio}-${String(numeroMes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

      // Si la fecha está bloqueada por una excepción, no incluirla
      if (fechasBloqueadas.has(fechaStr)) {
        continue;
      }

      const fecha = new Date(anio, numeroMes - 1, dia);

      // Lunes = 1, martes = 2, ..., domingo = 7
      const diaSemana = fecha.getDay() === 0
        ? 7
        : fecha.getDay();

      if (diasLaborales.has(diaSemana)) {
        fechasDisponibles.push(fechaStr);
      }
    }

    return res.status(200).json({
      fechasDisponibles
    });

  } catch (error) {
    console.error('Error al obtener fechas disponibles:', error);

    return res.status(500).json({
      error: 'Error al obtener las fechas disponibles'
    });
  }
});




/////http://localhost:4000/vl/profesionales/1/horarios-disponibles?fecha=2026-10-05


router.get(
  '/profesionales/:profesionalId/horarios-disponibles',
  async (req, res) => {
    try {
      const { profesionalId } = req.params;
      const { fecha } = req.query;

      if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({
          error: 'El parámetro fecha es obligatorio y debe tener formato YYYY-MM-DD'
        });
      }

      // Obtener día de la semana: lunes = 1, ..., domingo = 7
      const [anio, mes, dia] = fecha.split('-').map(Number);
      const fechaSeleccionada = new Date(anio, mes - 1, dia);

      const diaSemana = fechaSeleccionada.getDay() === 0
        ? 7
        : fechaSeleccionada.getDay();

      // Obtener configuración base del profesional (nuevo sistema)
      const horariosBase = await pool.query(
        `SELECT hora_inicio, hora_fin, duracion
         FROM horarios_base
         WHERE usuario_id = ? AND dia = ? AND activo = true
         LIMIT 1`,
        [profesionalId, diaSemana]
      );

      // Si no tiene configuración personal, usar configuración por defecto: L-V 8-18, 30 min
      let horarioConfig = horariosBase[0];
      if (!horarioConfig && diaSemana >= 1 && diaSemana <= 5) {
        horarioConfig = {
          hora_inicio: '08:00:00',
          hora_fin: '18:00:00',
          duracion: 30
        };
      }

      // Si no hay configuración para este día (sábado/domingo sin config personal)
      if (!horarioConfig) {
        return res.status(200).json([]);
      }

      // Generar slots de tiempo basados en la configuración
      const slots = [];
      let [horaInicio, minutoInicio] = horarioConfig.hora_inicio.split(':').map(Number);
      const [horaFin, minutoFin] = horarioConfig.hora_fin.split(':').map(Number);
      const duracion = horarioConfig.duracion;

      while (true) {
        const horaActual = horaInicio * 60 + minutoInicio;
        const horaFinMinutos = horaFin * 60 + minutoFin;

        if (horaActual >= horaFinMinutos) break;

        const horaStr = `${String(horaInicio).padStart(2, '0')}:${String(minutoInicio).padStart(2, '0')}`;
        slots.push({
          horario: horaStr,
          disponible: true
        });

        // Avanzar duración
        minutoInicio += duracion;
        while (minutoInicio >= 60) {
          minutoInicio -= 60;
          horaInicio++;
        }
      }

      // Obtener excepciones para esta fecha (nuevo sistema)
      const excepciones = await pool.query(
        `SELECT hora_inicio, hora_fin
         FROM horarios_excepciones
         WHERE usuario_id = ? AND fecha = ?`,
        [profesionalId, fecha]
      );

      // Obtener turnos ya reservados
      const turnos = await pool.query(
        `SELECT hora
         FROM turnos
         WHERE id_usuario = ? AND fecha = ? AND estado != 'cancelado'`,
        [profesionalId, fecha]
      );

      // Marcar slots no disponibles
      const turnosOcupados = new Set(turnos.map(t => t.hora.slice(0, 5)));

      for (const exc of excepciones) {
        // Bloqueo total del día
        if (!exc.hora_inicio && !exc.hora_fin) {
          slots.forEach(s => {
            s.disponible = false;
          });
          break;
        }

        // Bloqueo parcial
        const horaInicioExc = exc.hora_inicio.slice(0, 5);
        const horaFinExc = exc.hora_fin ? exc.hora_fin.slice(0, 5) : null;

        slots.forEach(s => {
          if (!s.disponible) return;

          // Verificar si el slot está dentro del rango bloqueado
          if (s.horario >= horaInicioExc && (!horaFinExc || s.horario < horaFinExc)) {
            s.disponible = false;
          }
        });
      }

      // Marcar turnos ocupados
      slots.forEach(s => {
        if (turnosOcupados.has(s.horario)) {
          s.disponible = false;
        }
      });

      return res.status(200).json(slots);

    } catch (error) {
      console.error('Error al obtener horarios disponibles:', error);

      return res.status(500).json({
        error: 'Error al obtener los horarios disponibles'
      });
    }
  }
);



/* 
router.post('/turnos', async (req, res) => {
  try {
    const {
      clinicaId,
      profesionalId,
      fecha,
      horario,
      paciente
    } = req.body;

    // Validar datos obligatorios
    if (
      !clinicaId ||
      !profesionalId ||
      !fecha ||
      !horario ||
      !paciente?.nombre ||
      !paciente?.apellido ||
      !paciente?.dni
    ) {
      return res.status(400).json({
        exito: false,
        mensaje: 'Faltan datos obligatorios para reservar el turno'
      });
    }

    // Verificar si el horario ya está ocupado
    const turnosExistentes = await pool.query(
      `SELECT id
       FROM turnos
       WHERE id_usuario = ?
         AND fecha = ?
         AND hora = ?`,
      [profesionalId, fecha, horario]
    );

    if (turnosExistentes.length > 0) {
      return res.status(409).json({
        exito: false,
        mensaje: 'El horario seleccionado ya está ocupado'
      });
    }

    // Registrar el turno
    const resultado = await pool.query(
      `INSERT INTO turnos
        (id_usuario, fecha, hora)
       VALUES (?, ?, ?)`,
      [profesionalId, fecha, horario]
    );

    return res.status(201).json({
      exito: true,
      mensaje: 'Turno reservado exitosamente',
      idTurno: Number(resultado.insertId),
      estado: 'CONFIRMADO',
      fechaCreacion: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error al reservar turno:', error);

    return res.status(500).json({
      exito: false,
      mensaje: 'Error al registrar el turno'
    });
  }
}); */



////////login

router.post(
    '/auth/login',

    passport.authenticate('local.signincli', {
        session: false
    }),

    async (req, res) => {
        try {
            const user = req.user;

            // Buscar la clínica asociada al usuario
            const rowsClinica = await pool.query(
                "SELECT * FROM clinicas WHERE id = ?",
                [user.id_clinica]
            );

            if (rowsClinica.length === 0) {
                return res.status(404).json({
                    message: 'No se encontró la clínica asociada al usuario'
                });
            }

            const clinica = rowsClinica[0];

            // Mapear nivel numérico a rol string para consistencia
            let role = user.rol;
            if (!role && user.nivel !== undefined) {
                // Si no hay rol explícito, mapear nivel a rol
                // Nivel 1 = administrativo, Nivel 2 = profesional
                role = user.nivel === 2 ? 'profesional' : 'administrativo';
            }

            // Datos que contendrá el token (incluyendo rol normalizado)
            const userForToken = {
                id: user.id,
                usuario: user.usuario,
                nivel: user.nivel,
                rol: role,
                id_clinica: user.id_clinica
            };

            const token = jwt.sign(
                userForToken,
                process.env.JWT_SECRET,
                {
                    expiresIn: '7d'
                }
            );

            // Respuesta del login
            return res.json({
                user: {
                    id: user.id,
                    username: user.usuario,
                    firstName: user.nombre,
                    lastName: user.apellido,
                    role: role,
                    professionalId: user.id_profesional ?? null
                },

                clinicId: user.id_clinica,

                clinic: {
                    id: clinica.id,
                    name: clinica.nombre,
                    address: clinica.direccion,
                    city: clinica.ciudad,
                    phone: clinica.telefono
                },

                token
            });

        } catch (error) {
            console.error('Error en /auth/login:', error);

            return res.status(500).json({
                message: 'Error interno al iniciar sesión'
            });
        }
    }
);





// Obtener y validar la sesión actual
router.get('/auth/me', autenticarToken, async (req, res) => {
    try {
        const rowsUsuario = await pool.query(
            `SELECT *
             FROM usuarios
             WHERE id = ?
             LIMIT 1`,
            [req.user.id]
        );

        if (rowsUsuario.length === 0) {
            return res.status(401).json({
                message: 'El usuario ya no existe'
            });
        }

        const user = rowsUsuario[0];

        const rowsClinica = await pool.query(
            `SELECT *
             FROM clinicas
             WHERE id = ?
             LIMIT 1`,
            [user.id_clinica]
        );

        if (rowsClinica.length === 0) {
            return res.status(404).json({
                message: 'No se encontró la clínica asociada'
            });
        }

        const clinica = rowsClinica[0];

        // Mapear nivel numérico a rol string para consistencia
        let role = user.rol;
        if (!role && user.nivel !== undefined) {
            // Si no hay rol explícito, mapear nivel a rol
            // Nivel 1 = administrativo, Nivel 2 = profesional
            role = user.nivel === 2 ? 'profesional' : 'administrativo';
        }

        return res.status(200).json({
            user: {
                id: user.id,
                username: user.usuario,
                firstName: user.nombre,
                lastName: user.apellido,
                role: role,
                professionalId: user.id_profesional ?? null
            },

            clinicId: user.id_clinica,

            clinic: {
                id: clinica.id,
                name: clinica.nombre,
                address: clinica.direccion,
                city: clinica.ciudad,
                phone: clinica.telefono
            }
        });

    } catch (error) {
        console.error('Error en /auth/me:', error);

        return res.status(500).json({
            message: 'Error al validar la sesión'
        });
    }
});



router.post('/auth/logout', autenticarToken, async (req, res) => {
    try {
        const tokenHash = obtenerHashToken(req.token);

        const expiraEn = new Date(req.user.exp * 1000)
            .toISOString()
            .slice(0, 19)
            .replace('T', ' ');

        await pool.query(
            `INSERT INTO tokens_revocados
                (token_hash, expira_en)
             VALUES (?, ?)`,
            [tokenHash, expiraEn]
        );

        return res.status(200).json({
            message: 'Sesión cerrada exitosamente'
        });

    } catch (error) {
        console.error('Error en /auth/logout:', error);

        return res.status(500).json({
            message: 'Error al cerrar la sesión'
        });
    }
});




///////////http://localhost:4000/vl/clinicas/1/turnos
///Parámetro	Qué hace	Ejemplo
///fecha	Busca turnos de una fecha específica	fecha=2026-10-14
///profesionalId	Filtra por ID del profesional	profesionalId=5
///estado	Por ahora devuelve error, porque todavía no configuramos ese filtro	estado=confirmado

router.get(
    '/clinicas/:clinicId/turnos',
    autenticarToken,
    async (req, res) => {
        try {
            const { clinicId } = req.params;
            const { fecha, profesionalId, estado } = req.query;

            if (!/^\d+$/.test(clinicId)) {
                return res.status(400).json({
                    message: 'clinicId inválido'
                });
            }

            // Validar acceso a la clínica
            if (
                Number(req.user.id_clinica) !== Number(clinicId)
            ) {
                return res.status(403).json({
                    message: 'No tenés acceso a esta clínica'
                });
            }

            // Filtrar siempre por la clínica solicitada
            const condiciones = [
                't.id_clinica = ?',
                't.fecha IS NOT NULL'
            ];

            const parametros = [clinicId];

            // Filtro por fecha
            if (fecha) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
                    return res.status(400).json({
                        message: 'La fecha debe tener formato YYYY-MM-DD'
                    });
                }

                condiciones.push('t.fecha = ?');
                parametros.push(fecha);
            }

            // Filtro por profesional
            if (profesionalId) {
                if (!/^\d+$/.test(profesionalId)) {
                    return res.status(400).json({
                        message: 'profesionalId inválido'
                    });
                }

                condiciones.push('t.id_usuario = ?');
                parametros.push(profesionalId);
            }

            // El filtro estado queda pendiente hasta confirmar
            // el nombre de la columna y sus valores en la tabla.
            if (estado) {
                return res.status(400).json({
                    message: 'El filtro estado todavía no está implementado'
                });
            }

            const turnos = await pool.query(
                `SELECT
                    t.id,
                    t.id_clinica AS clinicId,
                    t.id_usuario AS professionalId,
                    t.fecha AS date,
                    TIME_FORMAT(t.hora, '%H:%i') AS time,
                    t.id_paciente AS patientId,
                    t.estado AS status,
                    t.motivo AS reason,
                    u.nombre AS profFirstName,
                    u.apellido AS profLastName,
                    p.nombre AS firstName,
                    p.apellido AS lastName,
                    CONCAT(COALESCE(p.nombre, ''), ' ', COALESCE(p.apellido, '')) AS patientName,
                    p.dni AS patientDni,
                    p.email AS patientEmail,
                    p.telefono AS patientPhone,
                    p.obra_social AS healthInsurance
                 FROM turnos t
                 LEFT JOIN usuarios u ON t.id_usuario = u.id
                 LEFT JOIN pacientes p ON t.id_paciente = p.id
                 WHERE ${condiciones.join(' AND ')}
                 ORDER BY t.fecha ASC, t.hora ASC`,
                parametros
            );

            console.log('Turnos obtenidos:', turnos.length);
            if (turnos.length > 0) {
                console.log('Primer turno:', turnos[0]);
            }

            // Convertir BigInt a string para evitar errores de JSON
            const turnosJSON = turnos.map((turno) =>
                Object.fromEntries(
                    Object.entries(turno).map(([clave, valor]) => [
                        clave,
                        typeof valor === 'bigint'
                            ? valor.toString()
                            : valor
                    ])
                )
            );

            return res.status(200).json(turnosJSON);

        } catch (error) {
            console.error(
                'Error al obtener turnos de clínica:',
                error
            );

            return res.status(500).json({
                message: 'Error al obtener los turnos de la clínica'
            });
        }
    }
);




/**
 * Crea un turno (wizard público o panel).
 * - Sin JWT: reserva pública (paciente online).
 * - Con JWT: exige que la clínica del token coincida con clinicId.
 * Upsert de paciente por DNI+clínica e INSERT con id_paciente.
 */
async function crearTurnoHandler(req, res) {
    let conexion;

    try {
        const {
            clinicId,
            professionalId,
            date,
            time,
            status: statusBody,
            reason,
            patientName,
            patientDni,
            patientEmail,
            patientPhone,
            healthInsurance
        } = req.body;

        // Panel autenticado → confirmado por defecto; wizard público → pendiente
        const status = statusBody
            ?? (req.user ? 'confirmado' : 'pendiente');

        if (
            !clinicId ||
            !professionalId ||
            !date ||
            !time ||
            !patientName ||
            !patientDni
        ) {
            return res.status(400).json({
                message: 'Faltan datos obligatorios del turno o del paciente'
            });
        }

        if (
            !/^\d+$/.test(String(clinicId)) ||
            !/^\d+$/.test(String(professionalId))
        ) {
            return res.status(400).json({
                message: 'clinicId o professionalId inválido'
            });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                message: 'La fecha debe tener formato YYYY-MM-DD'
            });
        }

        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
            return res.status(400).json({
                message: 'El horario debe tener formato HH:mm'
            });
        }

        if (!['confirmado', 'pendiente', 'cancelado'].includes(status)) {
            return res.status(400).json({
                message: 'Estado de turno inválido'
            });
        }

        // Si hay sesión de panel, restringir a su clínica
        if (
            req.user &&
            Number(req.user.id_clinica) !== Number(clinicId)
        ) {
            return res.status(403).json({
                message: 'No tenés acceso a esta clínica'
            });
        }

        const nameParts = String(patientName).trim().split(/\s+/);
        const nombre = nameParts[0] || String(patientName).trim();
        const apellido = nameParts.slice(1).join(' ') || nombre;

        conexion = await pool.getConnection();
        await conexion.beginTransaction();

        const profesionales = await conexion.query(
            `SELECT u.id
             FROM usuarios u
             INNER JOIN trabajo t
               ON CAST(t.id_usuario AS CHAR) COLLATE utf8mb4_general_ci =
                  CAST(u.id AS CHAR) COLLATE utf8mb4_general_ci
             WHERE u.id = ?
               AND t.id_clinica = ?
               AND u.medico = 'Si'
             LIMIT 1`,
            [professionalId, clinicId]
        );

        if (profesionales.length === 0) {
            await conexion.rollback();
            return res.status(400).json({
                message: 'El profesional no pertenece a la clínica indicada'
            });
        }

        const pacientesExistentes = await conexion.query(
            `SELECT id
             FROM pacientes
             WHERE dni = ?
               AND id_clinica = ?
             LIMIT 1
             FOR UPDATE`,
            [String(patientDni), clinicId]
        );

        let resolvedPatientId;

        if (pacientesExistentes.length > 0) {
            resolvedPatientId = pacientesExistentes[0].id;

            await conexion.query(
                `UPDATE pacientes
                 SET nombre = ?,
                     apellido = ?,
                     email = COALESCE(?, email),
                     telefono = COALESCE(?, telefono),
                     obra_social = COALESCE(?, obra_social)
                 WHERE id = ?`,
                [
                    nombre,
                    apellido,
                    patientEmail || null,
                    patientPhone || null,
                    healthInsurance || null,
                    resolvedPatientId
                ]
            );
        } else {
            const nuevoPaciente = await conexion.query(
                `INSERT INTO pacientes
                    (nombre, apellido, dni, email, telefono, obra_social, id_clinica)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    nombre,
                    apellido,
                    String(patientDni),
                    patientEmail || null,
                    patientPhone || null,
                    healthInsurance || null,
                    clinicId
                ]
            );
            resolvedPatientId = nuevoPaciente.insertId;
        }

        const duplicados = await conexion.query(
            `SELECT id
             FROM turnos
             WHERE id_clinica = ?
               AND id_usuario = ?
               AND fecha = ?
               AND hora = ?
             LIMIT 1
             FOR UPDATE`,
            [clinicId, professionalId, date, time]
        );

        if (duplicados.length > 0) {
            await conexion.rollback();
            return res.status(409).json({
                message: 'El profesional ya tiene un turno en esa fecha y horario'
            });
        }

        const resultado = await conexion.query(
            `INSERT INTO turnos
                (id_clinica, id_usuario, fecha, hora, id_paciente, estado)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [clinicId, professionalId, date, time, resolvedPatientId, status]
        );

        await conexion.commit();

        return res.status(201).json({
            id: resultado.insertId.toString(),
            clinicId: String(clinicId),
            professionalId: String(professionalId),
            patientId: String(resolvedPatientId),
            date,
            time,
            status,
            reason: reason ?? null,
            patientName,
            patientDni: String(patientDni),
            patientEmail: patientEmail ?? null,
            patientPhone: patientPhone ?? null,
            healthInsurance: healthInsurance ?? null
        });

    } catch (error) {
        if (conexion) {
            await conexion.rollback();
        }

        console.error('Error al crear turno:', error);

        return res.status(500).json({
            message: 'Error al crear el turno'
        });

    } finally {
        if (conexion) {
            conexion.release();
        }
    }
}

// Alias público (mismo handler). Preferir POST /turnos.
router.post('/turnos/reservar', crearTurnoHandler);

// Ruta principal: panel (con JWT) y wizard público (sin JWT)
router.post('/turnos', autenticarTokenOpcional, crearTurnoHandler);



/* 
http://localhost:4000/vl/turnos/1
{
  "professionalId": 2,
  "patientId": 1,
  "date": "2026-10-16",
  "time": "11:00",
  "status": "confirmado",
  "reason": "Reprogramación por pedido del paciente",
  "patientName": "Roberto Díaz",
  "patientDni": "30456789",
  "patientEmail": "roberto.diaz@email.com",
  "patientPhone": "011-5555-1001",
  "healthInsurance": "osde"
} */

router.put(
    '/turnos/:appointmentId',
    autenticarToken,
    async (req, res) => {
        let conexion;

        try {
            const { appointmentId } = req.params;

            const {
                professionalId,
                patientId,
                date,
                time,
                status,
                reason,
                patientName,
                patientDni,
                patientEmail,
                patientPhone,
                healthInsurance
            } = req.body;

            // Validar ID del turno
            if (!/^\d+$/.test(appointmentId)) {
                return res.status(400).json({
                    message: 'appointmentId inválido'
                });
            }

            // Validar datos obligatorios
            if (!professionalId || !date || !time) {
                return res.status(400).json({
                    message: 'professionalId, date y time son obligatorios'
                });
            }

            if (!/^\d+$/.test(String(professionalId))) {
                return res.status(400).json({
                    message: 'professionalId inválido'
                });
            }

            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.status(400).json({
                    message: 'La fecha debe tener formato YYYY-MM-DD'
                });
            }

            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
                return res.status(400).json({
                    message: 'La hora debe tener formato HH:mm'
                });
            }

            if (
                status &&
                !['confirmado', 'pendiente', 'cancelado'].includes(status)
            ) {
                return res.status(400).json({
                    message: 'Estado de turno inválido'
                });
            }

            conexion = await pool.getConnection();
            await conexion.beginTransaction();

            // Buscar el turno existente
            const turnos = await conexion.query(
                `SELECT id, id_clinica, id_usuario, fecha, hora
                 FROM turnos
                 WHERE id = ?
                 FOR UPDATE`,
                [appointmentId]
            );

            if (turnos.length === 0) {
                await conexion.rollback();

                return res.status(404).json({
                    message: 'No se encontró el turno'
                });
            }

            const turnoActual = turnos[0];

            // Validar acceso a la clínica del turno
            if (
                Number(req.user.id_clinica) !==
                Number(turnoActual.id_clinica)
            ) {
                await conexion.rollback();

                return res.status(403).json({
                    message: 'No tenés acceso a este turno'
                });
            }

            // Verificar disponibilidad del nuevo horario
            const duplicados = await conexion.query(
                `SELECT id
                 FROM turnos
                 WHERE id_clinica = ?
                   AND id_usuario = ?
                   AND fecha = ?
                   AND hora = ?
                   AND id <> ?
                 LIMIT 1
                 FOR UPDATE`,
                [
                    turnoActual.id_clinica,
                    professionalId,
                    date,
                    time,
                    appointmentId
                ]
            );

            if (duplicados.length > 0) {
                await conexion.rollback();

                return res.status(409).json({
                    message: 'El profesional ya tiene un turno en esa fecha y horario'
                });
            }

            // Actualizar las columnas conocidas
            await conexion.query(
                `UPDATE turnos
                 SET id_usuario = ?,
                     fecha = ?,
                     hora = ?
                 WHERE id = ?`,
                [
                    professionalId,
                    date,
                    time,
                    appointmentId
                ]
            );

            await conexion.commit();

            return res.status(200).json({
                id: String(appointmentId),
                clinicId: String(turnoActual.id_clinica),
                professionalId: String(professionalId),
                patientId: patientId ?? null,
                date,
                time,
                status: status ?? null,
                reason: reason ?? null,
                patientName: patientName ?? null,
                patientDni: patientDni ?? null,
                patientEmail: patientEmail ?? null,
                patientPhone: patientPhone ?? null,
                healthInsurance: healthInsurance ?? null
            });

        } catch (error) {
            if (conexion) {
                await conexion.rollback();
            }

            console.error('Error al actualizar turno:', error);

            return res.status(500).json({
                message: 'Error al actualizar el turno'
            });

        } finally {
            if (conexion) {
                conexion.release();
            }
        }
    }
);



///http://localhost:4000/vl/turnos/1/cancelar
///probado sin ser de la clinica y devuelve 403
router.patch(
    '/turnos/:appointmentId/cancelar',
    autenticarToken,
    async (req, res) => {
        let conexion;

        try {
            const { appointmentId } = req.params;

            if (!/^\d+$/.test(appointmentId)) {
                return res.status(400).json({
                    message: 'appointmentId inválido'
                });
            }

            conexion = await pool.getConnection();
            await conexion.beginTransaction();

            // Buscar el turno
            const turnos = await conexion.query(
                `SELECT id, id_clinica, estado
                 FROM turnos
                 WHERE id = ?
                 FOR UPDATE`,
                [appointmentId]
            );

            if (turnos.length === 0) {
                await conexion.rollback();

                return res.status(404).json({
                    message: 'No se encontró el turno'
                });
            }

            const turno = turnos[0];

            // Validar acceso a la clínica
            if (
                Number(req.user.id_clinica) !==
                Number(turno.id_clinica)
            ) {
                await conexion.rollback();

                return res.status(403).json({
                    message: 'No tenés acceso a este turno'
                });
            }

            if (turno.estado === 'cancelado') {
                await conexion.rollback();

                return res.status(200).json({
                    id: String(turno.id),
                    status: 'cancelado',
                    updatedAt: new Date().toISOString()
                });
            }

            // Cancelar turno
            await conexion.query(
                `UPDATE turnos
                 SET estado = ?
                 WHERE id = ?`,
                ['cancelado', appointmentId]
            );

            await conexion.commit();

            return res.status(200).json({
                id: String(turno.id),
                status: 'cancelado',
                updatedAt: new Date().toISOString()
            });

        } catch (error) {
            if (conexion) {
                await conexion.rollback();
            }

            console.error('Error al cancelar turno:', error);

            return res.status(500).json({
                message: 'Error al cancelar el turno'
            });

        } finally {
            if (conexion) {
                conexion.release();
            }
        }
    }
);



//http://localhost:4000/vl/turnos/1
//// cambio por 
//http://localhost:4000/vl/clinicas/1/turnos/15
router.delete(
  '/clinicas/:clinicId/turnos/:appointmentId',
  autenticarToken,
  async (req, res) => {
    let conexion;

    try {
      const { clinicId, appointmentId } = req.params;

      if (
        !/^\d+$/.test(clinicId) ||
        !/^\d+$/.test(appointmentId)
      ) {
        return res.status(400).json({
          success: false,
          message: 'clinicId o appointmentId inválido'
        });
      }

      // Verificar que sea un usuario administrativo.
      // Ajustar estos valores a los niveles reales de tu sistema.
      const rol = String(req.user.rol ?? req.user.nivel ?? '')
        .toLowerCase();

      const esAdministrativo =
        ['administrativo', 'admin', 'administrador'].includes(rol) ||
        ['1', '10'].includes(rol);

      if (!esAdministrativo) {
        return res.status(403).json({
          success: false,
          message: 'Solo los usuarios administrativos pueden eliminar turnos'
        });
      }

      conexion = await pool.getConnection();
      await conexion.beginTransaction();

      // Verificar que el turno pertenezca a la clínica indicada.
      const turnos = await conexion.query(
        `SELECT id, id_clinica
         FROM turnos
         WHERE id = ? AND id_clinica = ?
         FOR UPDATE`,
        [appointmentId, clinicId]
      );

      if (turnos.length === 0) {
        await conexion.rollback();

        return res.status(404).json({
          success: false,
          message: 'No se encontró el turno en la clínica indicada'
        });
      }

      await conexion.query(
        `DELETE FROM turnos
         WHERE id = ? AND id_clinica = ?`,
        [appointmentId, clinicId]
      );

      await conexion.commit();

      return res.status(200).json({
        success: true,
        message: 'Turno eliminado exitosamente'
      });

    } catch (error) {
      if (conexion) {
        await conexion.rollback();
      }

      console.error('Error al eliminar turno:', error);

      return res.status(500).json({
        success: false,
        message: 'Error al eliminar el turno'
      });

    } finally {
      if (conexion) {
        conexion.release();
      }
    }
  }
);


/////http://localhost:4000/vl/clinicas/1/profesionales
router.get(
  '/clinicas/:clinicId/profesionales',
  autenticarToken,
  async (req, res) => {
    try {
      const { clinicId } = req.params;

      if (!/^\d+$/.test(clinicId)) {
        return res.status(400).json({
          message: 'clinicId inválido'
        });
      }

      // Verificar que el usuario sea administrativo.
      // Ajustar los niveles a los valores reales del sistema.
      const rol = String(req.user.rol ?? req.user.nivel ?? '')
        .toLowerCase();

      const esAdministrativo =
        ['administrativo', 'admin', 'administrador'].includes(rol) ||
        ['1', '10'].includes(rol);

      if (!esAdministrativo) {
        return res.status(403).json({
          message: 'Solo los usuarios administrativos pueden consultar profesionales'
        });
      }

      // Verificar que el usuario tenga acceso a esta clínica.
      // Se contempla la relación con varias clínicas mediante trabajo.
      const accesos = await pool.query(
        `SELECT id_usuario
         FROM trabajo
         WHERE id_usuario = ? AND id_clinica = ?
         LIMIT 1`,
        [req.user.id, clinicId]
      );

      // Si el usuario no tiene relación en trabajo, comprobar
      // si su clínica asignada en el token coincide.
      const tieneAcceso =
        accesos.length > 0 ||
        Number(req.user.id_clinica) === Number(clinicId);

      if (!tieneAcceso) {
        return res.status(403).json({
          message: 'No tenés acceso a esta clínica'
        });
      }

    
const profesionales = await pool.query(
  `SELECT DISTINCT
      u.id,
      u.nombre AS firstName,
      u.apellido AS lastName,
      e.nombre AS specialty
   FROM trabajo t
   INNER JOIN usuarios u
      ON u.id = t.id_usuario
   LEFT JOIN especializacion esp
      ON esp.id_medico = u.id
   LEFT JOIN especialidades e
      ON e.id = esp.id_especialidad
     AND e.id_clinica = t.id_clinica
   WHERE t.id_clinica = ?
     AND u.medico = 'Si'
   ORDER BY u.apellido, u.nombre, e.nombre`,
  [clinicId]
);


      // Un médico con varias especialidades puede aparecer
      // una vez por cada especialidad.
      const resultado = profesionales.map(p => ({
        id: typeof p.id === 'bigint' ? p.id.toString() : p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        specialty: p.specialty
      }));

      return res.status(200).json(resultado);

    } catch (error) {
      console.error(
        'Error al obtener profesionales de la clínica:',
        error
      );

      return res.status(500).json({
        message: 'Error al obtener los profesionales de la clínica'
      });
    }
  }
);






// GET /vl/profesionales/:professionalId
// Acceso: administrativo o el propio profesional
/////ver si el admin realmente puede ver la ficha de cualquier profesional, o los q tiene "asignado"
router.get(
  '/profesionales/:professionalId',
  autenticarToken,
  async (req, res) => {
    try {
      const { professionalId } = req.params;

      if (!/^\d+$/.test(professionalId)) {
        return res.status(400).json({
          message: 'professionalId inválido'
        });
      }

      // 1. Identificar al usuario autenticado mediante el JWT
      const usuarioId = String(req.user.id);

      const rol = String(
        req.user.rol ?? req.user.nivel ?? ''
      ).toLowerCase();

      const esAdministrativo =
        ['administrativo', 'admin', 'administrador'].includes(rol) ||
        ['1', '10'].includes(rol);

      // 2. Obtener los datos del usuario que inició sesión
      const usuariosSesion = await pool.query(
        `SELECT id, medico
         FROM usuarios
         WHERE id = ?
         LIMIT 1`,
        [usuarioId]
      );

      if (usuariosSesion.length === 0) {
        return res.status(401).json({
          message: 'El usuario autenticado ya no existe'
        });
      }

      const usuarioSesion = usuariosSesion[0];

      const esProfesional =
        String(usuarioSesion.medico ?? '')
          .trim()
          .toLowerCase() === 'si';

      // 3. Un profesional solo puede consultar su propia ficha.
      // Un administrativo puede consultar cualquier profesional.
      if (
        !esAdministrativo &&
        !(esProfesional &&
          usuarioId === String(professionalId))
      ) {
        return res.status(403).json({
          message: 'No tenés permiso para consultar esta ficha profesional'
        });
      }

      // 4. Buscar la ficha del profesional solicitado
      const filas = await pool.query(
        `SELECT *
         FROM usuarios
         WHERE id = ?
           AND medico = 'Si'
         LIMIT 1`,
        [professionalId]
      );

      if (filas.length === 0) {
        return res.status(404).json({
          message: 'No se encontró el profesional'
        });
      }

      const profesional = filas[0];

      // 5. Buscar sus especialidades, si tiene
      const especialidades = await pool.query(
        `SELECT DISTINCT e.nombre
         FROM especializacion esp
         INNER JOIN especialidades e
           ON e.id = esp.id_especialidad
         WHERE esp.id_medico = ?
         ORDER BY e.nombre`,
        [professionalId]
      );

      const specialty = especialidades.length > 0
        ? especialidades.map(e => e.nombre).join(', ')
        : null;

      // 6. Devolver solamente los datos públicos de la ficha
      return res.status(200).json({
        id: typeof profesional.id === 'bigint'
          ? profesional.id.toString()
          : profesional.id,

        firstName: profesional.nombre,
        lastName: profesional.apellido,

        specialty,

        // Ajustar estos nombres al esquema real de la base
        licenseNumber:
          profesional.matricula ??
          profesional.numero_matricula ??
          null,

        phone:
          profesional.telefono ??
          profesional.tel ??
          null,

        email:
          profesional.mail ??
          null
      });

    } catch (error) {
      console.error(
        'Error al obtener la ficha del profesional:',
        error
      );

      return res.status(500).json({
        message: 'Error al obtener la ficha del profesional'
      });
    }
  }
);




// GET /api/v1/clinicas/:clinicId/pacientes
router.get(
  '/clinicas/:clinicId/pacientes',
  autenticarToken,
  async (req, res) => {
    try {
      const { clinicId } = req.params;

      // Validar ID de la clínica
      if (!/^\d+$/.test(clinicId)) {
        return res.status(400).json({
          error: 'El ID de la clínica no es válido'
        });
      }

      // Verificar que el usuario sea administrativo
      const rol = String(
        req.user.rol ?? req.user.nivel ?? ''
      ).toLowerCase();

      const esAdministrativo =
        ['administrativo', 'admin', 'administrador'].includes(rol) ||
        ['1', '10'].includes(rol);

      if (!esAdministrativo) {
        return res.status(403).json({
          error: 'No tenés permisos para consultar los pacientes'
        });
      }

      // Verificar acceso a la clínica
      const acceso = await pool.query(
        `SELECT id
         FROM usuarios
         WHERE id = ?
           AND id_clinica = ?
         LIMIT 1`,
        [req.user.id, clinicId]
      );

      if (!acceso.length) {
        return res.status(403).json({
          error: 'No tenés acceso a esta clínica'
        });
      }

      // Obtener pacientes que tienen o tuvieron turnos en la clínica
     const pacientes = await pool.query(
  `SELECT DISTINCT
      p.id,
      p.nombre AS firstName,
      p.apellido AS lastName,
      p.dni,
      p.email,
      p.telefono AS phone,
      p.obra_social AS healthInsurance,
      DATE_FORMAT(p.fecha_nacimiento, '%Y-%m-%d') AS birthDate
   FROM pacientes p
   WHERE p.id_clinica = ?
   ORDER BY p.apellido, p.nombre`,
  [clinicId]
);

      return res.status(200).json(pacientes);

    } catch (error) {
      console.error('Error al obtener pacientes de la clínica:', error);

      return res.status(500).json({
        error: 'Error interno al obtener los pacientes'
      });
    }
  }
);





////api/v1/pacientes/:patientId
///GET http://localhost:4000/vl/pacientes/1
////considerar si ees de otra clinica ver el get conl imitaicones
router.get(
  '/pacientes/:patientId',
  autenticarToken,
  async (req, res) => {
    try {
      const { patientId } = req.params;

      if (!/^\d+$/.test(patientId)) {
        return res.status(400).json({
          message: 'patientId inválido'
        });
      }

      // Validar rol del usuario autenticado.
      const rol = String(req.user.rol ?? req.user.nivel ?? '')
        .toLowerCase();

      const esAdministrativo = [
        'administrativo',
        'admin',
        'administrador'
      ].includes(rol);

      const esProfesional = [
        'profesional',
        'medico',
        'médico'
      ].includes(rol);

      // Ajustar los niveles numéricos según tu sistema.
      const esNivelAdministrativo = ['1', '10'].includes(rol);
      const esNivelProfesional = ['2'].includes(rol);

      if (
        !esAdministrativo &&
        !esProfesional &&
        !esNivelAdministrativo &&
        !esNivelProfesional
      ) {
        return res.status(403).json({
          message: 'No tenés permisos para consultar pacientes'
        });
      }

      // Buscar los datos de filiación del paciente.
      const pacientes = await pool.query(
        `SELECT
            id,
            nombre AS firstName,
            apellido AS lastName,
            dni,
            email,
            telefono AS phone,
            obra_social AS healthInsurance,
            fecha_nacimiento AS birthDate
         FROM pacientes
         WHERE id = ?
         LIMIT 1`,
        [patientId]
      );

      if (pacientes.length === 0) {
        return res.status(404).json({
          message: 'Paciente no encontrado'
        });
      }

      const paciente = pacientes[0];

      return res.status(200).json({
        id: typeof paciente.id === 'bigint'
          ? paciente.id.toString()
          : paciente.id,
        firstName: paciente.firstName,
        lastName: paciente.lastName,
        dni: paciente.dni,
        email: paciente.email,
        phone: paciente.phone,
        healthInsurance: paciente.healthInsurance,
        birthDate: paciente.birthDate
          ? String(paciente.birthDate).slice(0, 10)
          : null
      });

    } catch (error) {
      console.error('Error al obtener paciente:', error);

      return res.status(500).json({
        message: 'Error al obtener los datos del paciente'
      });
    }
  }
);





////GET http://localhost:4000/vl/clinicas/1/estadisticas?mes=9&anio=2026


router.get(
  '/clinicas/:clinicId/estadisticas',
  autenticarToken,
  async (req, res) => {
    try {
      const { clinicId } = req.params;
      const { mes, anio } = req.query;

      if (!/^\d+$/.test(clinicId)) {
        return res.status(400).json({
          message: 'clinicId inválido'
        });
      }

      const mesIndex = Number(mes);
      const year = Number(anio);

      if (
        !Number.isInteger(mesIndex) ||
        mesIndex < 0 ||
        mesIndex > 11 ||
        !Number.isInteger(year) ||
        year < 2000 ||
        year > 2100
      ) {
        return res.status(400).json({
          message: 'Debe indicar mes entre 0 y 11 y un año válido'
        });
      }

      const rol = String(req.user.rol ?? req.user.nivel ?? '')
        .toLowerCase();

      const esAdministrativo =
        ['administrativo', 'admin', 'administrador'].includes(rol) ||
        ['1', '10'].includes(rol); // Ajustar a los niveles reales.

      if (!esAdministrativo) {
        return res.status(403).json({
          message: 'Solo los usuarios administrativos pueden consultar estadísticas'
        });
      }

      // Comprobar acceso a la sede.
      const accesos = await pool.query(
        `SELECT id_usuario
         FROM trabajo
         WHERE id_usuario = ? AND id_clinica = ?
         LIMIT 1`,
        [req.user.id, clinicId]
      );

      const tieneAcceso =
        accesos.length > 0 ||
        Number(req.user.id_clinica) === Number(clinicId);

      if (!tieneAcceso) {
        return res.status(403).json({
          message: 'No tenés acceso a esta clínica'
        });
      }

      // Inicio inclusivo y fin exclusivo del mes.
      const desde = `${year}-${String(mesIndex + 1).padStart(2, '0')}-01`;

      const siguienteMes = new Date(Date.UTC(year, mesIndex + 1, 1));
      const hasta = [
        siguienteMes.getUTCFullYear(),
        String(siguienteMes.getUTCMonth() + 1).padStart(2, '0'),
        '01'
      ].join('-');

      const turnos = await pool.query(
        `SELECT
            t.id,
            t.id_usuario AS professionalId,
            t.estado AS status,
            t.id_paciente AS patientId
         FROM turnos t
         WHERE t.id_clinica = ?
           AND t.fecha >= ?
           AND t.fecha < ?`,
        [clinicId, desde, hasta]
      );

      const normalizarEstado = estado =>
        String(estado ?? '').trim().toLowerCase();

      const esConfirmado = estado =>
        ['confirmado', 'confirmada'].includes(normalizarEstado(estado));

      const esPendiente = estado =>
        ['pendiente'].includes(normalizarEstado(estado));

      const esCancelado = estado =>
        ['cancelado', 'cancelada'].includes(normalizarEstado(estado));

      const unique = valores =>
        new Set(valores.filter(v => v !== null && v !== undefined).map(String)).size;

      const totalAppointments = turnos.length;
      const confirmedCount = turnos.filter(t => esConfirmado(t.status)).length;
      const pendingCount = turnos.filter(t => esPendiente(t.status)).length;
      const cancelledCount = turnos.filter(t => esCancelado(t.status)).length;
      const uniquePatients = unique(turnos.map(t => t.patientId));

      // Agrupar por profesional.
      const agrupados = new Map();

      for (const turno of turnos) {
        const id = String(turno.professionalId);

        if (!agrupados.has(id)) {
          agrupados.set(id, {
            turnos: [],
            confirmedCount: 0,
            pendingCount: 0,
            cancelledCount: 0,
            pacientes: new Set()
          });
        }

        const grupo = agrupados.get(id);
        grupo.turnos.push(turno);

        if (esConfirmado(turno.status)) grupo.confirmedCount++;
        if (esPendiente(turno.status)) grupo.pendingCount++;
        if (esCancelado(turno.status)) grupo.cancelledCount++;

        if (turno.patientId !== null && turno.patientId !== undefined) {
          grupo.pacientes.add(String(turno.patientId));
        }
      }

      const byProfessional = [];

      for (const [professionalId, grupo] of agrupados) {
        const profesionales = await pool.query(
          `SELECT DISTINCT
              u.id,
              u.nombre AS firstName,
              u.apellido AS lastName,
              e.nombre AS specialty
           FROM usuarios u
           INNER JOIN trabajo t
             ON t.id_usuario = u.id
           LEFT JOIN especializacion esp
             ON esp.id_medico = u.id
           LEFT JOIN especialidades e
             ON e.id = esp.id_especialidad
            AND e.id_clinica = t.id_clinica
           WHERE u.id = ?
             AND t.id_clinica = ?
           LIMIT 1`,
          [professionalId, clinicId]
        );

        const profesional = profesionales[0];

        if (!profesional) continue;

        byProfessional.push({
          professional: {
            id: typeof profesional.id === 'bigint'
              ? profesional.id.toString()
              : profesional.id,
            firstName: profesional.firstName,
            lastName: profesional.lastName,
            specialty: profesional.specialty ?? null
          },
          totalAppointments: grupo.turnos.length,
          confirmedCount: grupo.confirmedCount,
          pendingCount: grupo.pendingCount,
          cancelledCount: grupo.cancelledCount,
          uniquePatients: grupo.pacientes.size
        });
      }

      byProfessional.sort(
        (a, b) => b.totalAppointments - a.totalAppointments
      );

      const top = byProfessional[0];

      return res.status(200).json({
        totalAppointments,
        confirmedCount,
        pendingCount,
        cancelledCount,
        uniquePatients,
        topProfessional: top
          ? {
              professional: top.professional,
              totalAppointments: top.totalAppointments,
              uniquePatients: top.uniquePatients
            }
          : null,
        byProfessional
      });

    } catch (error) {
      console.error('Error al obtener estadísticas:', error);

      return res.status(500).json({
        message: 'Error al obtener estadísticas de la clínica'
      });
    }
  }
);




///pofesional
//GET http://localhost:4000/vl/turnos?clinicaId=1&profesionalId=2

router.get(
  '/turnos',
  autenticarToken,
  async (req, res) => {
    try {
      const { clinicaId, profesionalId } = req.query;

      // 1. Validar parámetros recibidos
      if (
        !clinicaId ||
        !/^\d+$/.test(clinicaId) ||
        !profesionalId ||
        !/^\d+$/.test(profesionalId)
      ) {
        return res.status(400).json({
          message: 'Debe indicar clinicaId y profesionalId válidos'
        });
      }

      // 2. Obtener el ID del usuario autenticado desde el token
      const usuarioId = req.user.id;

      console.log('ID del usuario autenticado:', usuarioId);
      console.log('Nivel del token:', req.user.nivel);

      // 3. Verificar en la base de datos si el usuario es médico
      const usuarios = await pool.query(
        `SELECT id, medico
         FROM usuarios
         WHERE id = ?
         LIMIT 1`,
        [usuarioId]
      );

      if (
        usuarios.length === 0 ||
        usuarios[0].medico !== 'Si'
      ) {
        return res.status(403).json({
          message: 'Este endpoint es exclusivo para profesionales'
        });
      }

      console.log('Usuario validado como médico:', usuarios[0].id);

      // 4. El profesional solicitado debe ser el usuario autenticado
      if (Number(profesionalId) !== Number(usuarioId)) {
        return res.status(403).json({
          message: 'Solo podés consultar tus propios turnos'
        });
      }

      // 5. Verificar que el profesional trabaje en la clínica solicitada
      const trabajos = await pool.query(
        `SELECT id_usuario
         FROM trabajo
         WHERE id_usuario = ?
           AND id_clinica = ?
         LIMIT 1`,
        [usuarioId, clinicaId]
      );

      if (trabajos.length === 0) {
        return res.status(403).json({
          message: 'No trabajás en la clínica seleccionada'
        });
      }

      // 6. Obtener exclusivamente los turnos propios de esa clínica
      const turnos = await pool.query(
        `SELECT
            t.id,
            t.id_clinica AS clinicId,
            t.id_usuario AS professionalId,
            t.fecha AS date,
            TIME_FORMAT(t.hora, '%H:%i') AS time,
            t.id_paciente AS patientId,
            t.estado AS status,
            t.motivo AS reason,
            u.nombre AS profFirstName,
            u.apellido AS profLastName,
            p.nombre AS firstName,
            p.apellido AS lastName,
            CONCAT(COALESCE(p.nombre, ''), ' ', COALESCE(p.apellido, '')) AS patientName,
            p.dni AS patientDni,
            p.email AS patientEmail,
            p.telefono AS patientPhone,
            p.obra_social AS healthInsurance
         FROM turnos t
         LEFT JOIN usuarios u ON t.id_usuario = u.id
         LEFT JOIN pacientes p ON t.id_paciente = p.id
         WHERE t.id_clinica = ?
           AND t.id_usuario = ?
         ORDER BY t.fecha ASC, t.hora ASC`,
        [clinicaId, usuarioId]
      );

      // 7. Convertir posibles valores BIGINT a string para JSON
      const resultado = turnos.map(turno => ({
        ...turno,
        id: turno.id != null
          ? String(turno.id)
          : turno.id,
        clinicId: turno.clinicId != null
          ? String(turno.clinicId)
          : turno.clinicId,
        professionalId: turno.professionalId != null
          ? String(turno.professionalId)
          : turno.professionalId
      }));

      return res.status(200).json(resultado);

    } catch (error) {
      console.error(
        'Error al obtener turnos del profesional:',
        error
      );

      return res.status(500).json({
        message: 'Error al obtener los turnos del profesional'
      });
    }
  }
);





////GET /pacientes?clinicaId=1&profesionalId=2
router.get(
  '/pacientes',
  autenticarToken,
  async (req, res) => {
    try {
      const { clinicaId, profesionalId } = req.query;

      // 1. Validar parámetros
      if (
        !clinicaId ||
        !/^\d+$/.test(clinicaId) ||
        !profesionalId ||
        !/^\d+$/.test(profesionalId)
      ) {
        return res.status(400).json({
          message: 'Debe indicar clinicaId y profesionalId válidos'
        });
      }

      // 2. Obtener el usuario autenticado desde el token
      const usuarioId = req.user.id;

      console.log('Usuario autenticado:', usuarioId);
      console.log('Nivel del token:', req.user.nivel);

      // 3. Verificar que el usuario sea médico
      const usuarios = await pool.query(
        `SELECT id, medico
         FROM usuarios
         WHERE id = ?
         LIMIT 1`,
        [usuarioId]
      );

      if (
        usuarios.length === 0 ||
        usuarios[0].medico !== 'Si'
      ) {
        return res.status(403).json({
          message: 'Este endpoint es exclusivo para profesionales'
        });
      }

      // 4. El profesional solicitado debe ser el autenticado
      if (Number(profesionalId) !== Number(usuarioId)) {
        return res.status(403).json({
          message: 'Solo podés consultar tus propios pacientes'
        });
      }

      // 5. Verificar que trabaje en la clínica solicitada
      const trabajos = await pool.query(
        `SELECT id_usuario
         FROM trabajo
         WHERE id_usuario = ?
           AND id_clinica = ?
         LIMIT 1`,
        [usuarioId, clinicaId]
      );

      if (trabajos.length === 0) {
        return res.status(403).json({
          message: 'No trabajás en la clínica seleccionada'
        });
      }

      // 6. Obtener pacientes únicos con turnos del profesional
      //    en la clínica seleccionada
      const pacientes = await pool.query(
        `SELECT DISTINCT
            p.id,
            p.nombre,
            p.apellido,
            p.dni,
            p.email,
            p.telefono
         FROM pacientes p
         INNER JOIN turnos t
           ON t.id_paciente = p.id
         WHERE t.id_clinica = ?
           AND t.id_usuario = ?
         ORDER BY p.apellido ASC, p.nombre ASC`,
        [clinicaId, usuarioId]
      );

      // 7. Normalizar BIGINT para que pueda serializarse en JSON
      const resultado = pacientes.map(paciente => ({
        ...paciente,
        id: paciente.id != null
          ? String(paciente.id)
          : paciente.id
      }));

      return res.status(200).json(resultado);

    } catch (error) {
      console.error(
        'Error al obtener pacientes del profesional:',
        error
      );

      return res.status(500).json({
        message: 'Error al obtener los pacientes'
      });
    }
  }
);




router.get(
  '/informes',
  autenticarToken,
  async (req, res) => {
    try {
      const {
        clinicaId,
        pacienteId,
        profesionalId
      } = req.query;

      // 1. Validar parámetros
      if (
        !clinicaId ||
        !/^\d+$/.test(clinicaId) ||
        !pacienteId ||
        !/^\d+$/.test(pacienteId) ||
        !profesionalId ||
        !/^\d+$/.test(profesionalId)
      ) {
        return res.status(400).json({
          message:
            'Debe indicar clinicaId, pacienteId y profesionalId válidos'
        });
      }

      // 2. Obtener el usuario autenticado desde el token
      const usuarioId = req.user.id;

      console.log('Usuario autenticado:', usuarioId);
      console.log('Nivel del token:', req.user.nivel);

      // 3. Verificar que el usuario sea médico
      const usuarios = await pool.query(
        `SELECT id, medico
         FROM usuarios
         WHERE id = ?
         LIMIT 1`,
        [usuarioId]
      );

      if (
        usuarios.length === 0 ||
        usuarios[0].medico !== 'Si'
      ) {
        return res.status(403).json({
          message: 'Este endpoint es exclusivo para profesionales'
        });
      }

      // 4. El profesional solicitado debe ser el autenticado
      if (Number(profesionalId) !== Number(usuarioId)) {
        return res.status(403).json({
          message: 'Solo podés consultar tus propios informes'
        });
      }

      // 5. Verificar que trabaje en la clínica solicitada
      const trabajos = await pool.query(
        `SELECT id_usuario
         FROM trabajo
         WHERE id_usuario = ?
           AND id_clinica = ?
         LIMIT 1`,
        [usuarioId, clinicaId]
      );

      if (trabajos.length === 0) {
        return res.status(403).json({
          message: 'No trabajás en la clínica seleccionada'
        });
      }

      // 6. Obtener informes del profesional para ese paciente
      const informes = await pool.query(
        `SELECT
            i.id,
            i.id_clinica AS clinicId,
            i.id_usuario AS professionalId,
            i.id_paciente AS patientId,
            i.id_turno AS appointmentId,
            DATE_FORMAT(i.fecha, '%Y-%m-%d') AS date,
            i.diagnostico AS diagnosis,
            i.tratamiento AS treatment
         FROM informes i
         WHERE i.id_clinica = ?
           AND i.id_usuario = ?
           AND i.id_paciente = ?
         ORDER BY i.fecha DESC, i.id DESC`,
        [clinicaId, usuarioId, pacienteId]
      );

      // 7. Normalizar identificadores BIGINT para JSON
      const resultado = informes.map(informe => ({
        ...informe,
        id: informe.id != null
          ? String(informe.id)
          : informe.id,
        clinicId: informe.clinicId != null
          ? String(informe.clinicId)
          : informe.clinicId,
        professionalId: informe.professionalId != null
          ? String(informe.professionalId)
          : informe.professionalId,
        patientId: informe.patientId != null
          ? String(informe.patientId)
          : informe.patientId,
        appointmentId: informe.appointmentId != null
          ? String(informe.appointmentId)
          : informe.appointmentId
      }));

      return res.status(200).json(resultado);

    } catch (error) {
      console.error(
        'Error al obtener informes del profesional:',
        error
      );

      return res.status(500).json({
        message: 'Error al obtener los informes'
      });
    }
  }
);





/*
{
  "id": "12",
  "clinicId": 1,
  "professionalId": 1,
  "patientId": 1,
  "appointmentId": null,
  "date": "2026-10-11",
  "diagnosis": "Control de rutina. Presión arterial 120/80 mmHg.",
  "treatment": "Continuar con dieta normosódica y caminata diaria de 30 minutos."
}*/

router.post(
  '/informes',
  autenticarToken,
  async (req, res) => {
    try {
      const {
        clinicId,
        professionalId,
        patientId,
        appointmentId,
        date,
        diagnosis,
        treatment
      } = req.body;

      // 1. Validar campos obligatorios
      if (
        clinicId == null ||
        !/^\d+$/.test(String(clinicId)) ||
        patientId == null ||
        !/^\d+$/.test(String(patientId)) ||
        professionalId == null ||
        !/^\d+$/.test(String(professionalId)) ||
        !date ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        typeof diagnosis !== 'string' ||
        !diagnosis.trim() ||
        typeof treatment !== 'string' ||
        !treatment.trim()
      ) {
        return res.status(400).json({
          message: 'Debe completar los datos obligatorios del informe'
        });
      }

      // 2. Validar appointmentId si se envía
      if (
        appointmentId != null &&
        !/^\d+$/.test(String(appointmentId))
      ) {
        return res.status(400).json({
          message: 'appointmentId debe ser un número válido o null'
        });
      }

      // 3. Obtener usuario autenticado
      const usuarioId = req.user.id;

      // 4. Verificar que sea médico
      const usuarios = await pool.query(
        `SELECT id, medico
         FROM clinica.usuarios
         WHERE id = ?
         LIMIT 1`,
        [usuarioId]
      );

      if (
        usuarios.length === 0 ||
        usuarios[0].medico !== 'Si'
      ) {
        return res.status(403).json({
          message: 'Este endpoint es exclusivo para profesionales'
        });
      }

      // 5. El profesional debe coincidir con el usuario autenticado
      if (Number(professionalId) !== Number(usuarioId)) {
        return res.status(403).json({
          message: 'Solo podés registrar informes propios'
        });
      }

      // 6. Verificar que trabaje en la clínica
      const trabajos = await pool.query(
        `SELECT id_usuario
         FROM clinica.trabajo
         WHERE id_usuario = ?
           AND id_clinica = ?
         LIMIT 1`,
        [usuarioId, clinicId]
      );

      if (trabajos.length === 0) {
        return res.status(403).json({
          message: 'No trabajás en la clínica seleccionada'
        });
      }

      // 7. Verificar que el paciente exista
      const pacientes = await pool.query(
        `SELECT id
         FROM clinica.pacientes
         WHERE id = ?
         LIMIT 1`,
        [patientId]
      );

      if (pacientes.length === 0) {
        return res.status(404).json({
          message: 'El paciente no existe'
        });
      }

      // 8. Si hay turno, verificar que corresponda
      //    al profesional, paciente y clínica indicados
      if (appointmentId != null) {
        const turnos = await pool.query(
          `SELECT id
           FROM clinica.turnos
           WHERE id = ?
             AND id_clinica = ?
             AND id_usuario = ?
             AND id_paciente = ?
           LIMIT 1`,
          [appointmentId, clinicId, usuarioId, patientId]
        );

        if (turnos.length === 0) {
          return res.status(400).json({
            message:
              'El turno no corresponde al profesional, paciente y clínica indicados'
          });
        }
      }

      // 9. Crear informe
      const resultado = await pool.query(
        `INSERT INTO clinica.informes (
           id_clinica,
           id_usuario,
           id_paciente,
           id_turno,
           fecha,
           diagnostico,
           tratamiento
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          clinicId,
          usuarioId,
          patientId,
          appointmentId ?? null,
          date,
          diagnosis.trim(),
          treatment.trim()
        ]
      );

      // 10. Devolver informe creado
      const nuevoInforme = {
        id: String(resultado.insertId),
        clinicId: Number(clinicId),
        professionalId: Number(usuarioId),
        patientId: Number(patientId),
        appointmentId:
          appointmentId == null ? null : Number(appointmentId),
        date,
        diagnosis: diagnosis.trim(),
        treatment: treatment.trim()
      };

      return res.status(201).json(nuevoInforme);

    } catch (error) {
      console.error('Error al crear informe médico:', error);

      return res.status(500).json({
        message: 'Error al registrar el informe médico'
      });
    }
  }
);




//////http://localhost:4000/v1/informes/12
/*
{
  "date": "2026-10-11",
  "diagnosis": "Diagnóstico corregido / ampliado",
  "treatment": "Tratamiento actualizado"
}
http://localhost:4000/v1/informes/12

*/
router.put(
  '/informes/:reportId',
  autenticarToken,
  async (req, res) => {
    try {
      const { reportId } = req.params;
      const { date, diagnosis, treatment } = req.body;

      // 1. Validar ID del informe
      if (!/^\d+$/.test(reportId) || Number(reportId) <= 0) {
        return res.status(400).json({
          message: 'El ID del informe no es válido'
        });
      }

      // 2. Validar que se envíen los campos permitidos
      if (
        date === undefined &&
        diagnosis === undefined &&
        treatment === undefined
      ) {
        return res.status(400).json({
          message: 'Debe indicar al menos un campo para modificar'
        });
      }

      // 3. Validar fecha si fue enviada
      if (
        date !== undefined &&
        (
          typeof date !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date)
        )
      ) {
        return res.status(400).json({
          message: 'La fecha debe tener el formato YYYY-MM-DD'
        });
      }

      // 4. Validar diagnóstico y tratamiento si fueron enviados
      if (
        diagnosis !== undefined &&
        (typeof diagnosis !== 'string' || !diagnosis.trim())
      ) {
        return res.status(400).json({
          message: 'El diagnóstico no puede estar vacío'
        });
      }

      if (
        treatment !== undefined &&
        (typeof treatment !== 'string' || !treatment.trim())
      ) {
        return res.status(400).json({
          message: 'El tratamiento no puede estar vacío'
        });
      }

      // 5. Obtener el usuario autenticado
      const usuarioId = req.user.id;

      // 6. Verificar que el usuario sea médico
      const usuarios = await pool.query(
        `SELECT id, medico
         FROM clinica.usuarios
         WHERE id = ?
         LIMIT 1`,
        [usuarioId]
      );

      if (
        usuarios.length === 0 ||
        usuarios[0].medico !== 'Si'
      ) {
        return res.status(403).json({
          message: 'Este endpoint es exclusivo para profesionales'
        });
      }

      // 7. Buscar el informe y verificar su propietario
      const informes = await pool.query(
        `SELECT
            id,
            id_clinica,
            id_usuario,
            id_paciente,
            id_turno,
            fecha,
            diagnostico,
            tratamiento
         FROM clinica.informes
         WHERE id = ?
           AND id_usuario = ?
         LIMIT 1`,
        [reportId, usuarioId]
      );

      if (informes.length === 0) {
        return res.status(404).json({
          message: 'Informe no encontrado o no tenés permiso para modificarlo'
        });
      }

      const informeActual = informes[0];

      // 8. Actualizar solamente los campos recibidos
      const nuevaFecha = date ?? informeActual.fecha;
      const nuevoDiagnostico =
        diagnosis !== undefined
          ? diagnosis.trim()
          : informeActual.diagnostico;
      const nuevoTratamiento =
        treatment !== undefined
          ? treatment.trim()
          : informeActual.tratamiento;

      await pool.query(
        `UPDATE clinica.informes
         SET fecha = ?,
             diagnostico = ?,
             tratamiento = ?
         WHERE id = ?
           AND id_usuario = ?`,
        [
          nuevaFecha,
          nuevoDiagnostico,
          nuevoTratamiento,
          reportId,
          usuarioId
        ]
      );

      // 9. Devolver el informe actualizado
      const resultado = await pool.query(
        `SELECT
            id,
            id_clinica AS clinicId,
            id_usuario AS professionalId,
            id_paciente AS patientId,
            id_turno AS appointmentId,
            DATE_FORMAT(fecha, '%Y-%m-%d') AS date,
            diagnostico AS diagnosis,
            tratamiento AS treatment
         FROM clinica.informes
         WHERE id = ?
           AND id_usuario = ?
         LIMIT 1`,
        [reportId, usuarioId]
      );

      const actualizado = resultado[0];

      return res.status(200).json({
        ...actualizado,
        id: String(actualizado.id),
        clinicId: String(actualizado.clinicId),
        professionalId: String(actualizado.professionalId),
        patientId: String(actualizado.patientId),
        appointmentId: actualizado.appointmentId == null
          ? null
          : String(actualizado.appointmentId)
      });

    } catch (error) {
      console.error('Error al actualizar informe médico:', error);

      return res.status(500).json({
        message: 'Error al actualizar el informe médico'
      });
    }
  }
);

/////v1/informes/:reportId
router.delete(
  '/informes/:reportId',
  autenticarToken,
  async (req, res) => {
    try {
      const { reportId } = req.params;
      const profesionalId = req.user.id;

      // Validar el ID del informe
      if (!/^\d+$/.test(reportId)) {
        return res.status(400).json({
          success: false,
          message: 'El ID del informe no es válido'
        });
      }

      // Verificar que el informe pertenezca al profesional autenticado
      const informes = await pool.query(
        `SELECT id
         FROM informes
         WHERE id = ?
           AND id_usuario = ?`,
        [reportId, profesionalId]
      );

      if (informes.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Informe no encontrado o no autorizado'
        });
      }

      // Eliminar el informe
      await pool.query(
        `DELETE FROM informes
         WHERE id = ?
           AND id_usuario = ?`,
        [reportId, profesionalId]
      );

      return res.status(200).json({
        success: true,
        message: 'Informe médico eliminado correctamente'
      });

    } catch (error) {
      console.error('Error al eliminar el informe:', error);

      return res.status(500).json({
        success: false,
        message: 'Error interno al eliminar el informe'
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// SISTEMA DE GESTIÓN DE HORARIOS (CONFIGURACIÓN BASE + EXCEPCIONES)
// ═══════════════════════════════════════════════════════════════════════════
//
// ARQUITECTURA DE HORARIOS:
//
// 1. CONFIGURACIÓN BASE (horarios_base):
//    - Define el horario estándar L-V 8:00-18:00 de la clínica
//    - Cada profesional puede tener su propia configuración base
//    - Campos: usuario_id, dia (1-5), hora_inicio, hora_fin, duracion, activo
//
// 2. EXCEPCIONES (horarios_excepciones):
//    - Bloqueos específicos de fechas/horarios
//    - Tipos: 'vacacion', 'feriado', 'no_disponible', 'bloqueo_temporal'
//    - Campos: usuario_id, fecha, hora_inicio, hora_fin, tipo, motivo
//
// 3. ALGORITMO DE DISPONIBILIDAD:
//    - Comienza con configuración base (L-V 8-18)
//    - Aplica excepciones (feriados, vacaciones, bloqueos)
//    - Rest turnos ya reservados
//    - Retorna slots disponibles
//
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Obtiene la configuración de horarios de un profesional.
 * Si no tiene configuración personal, usa la configuración base de la clínica (L-V 8-18).
 *
 * GET /v1/profesionales/:id/horarios-config
 *
 * @returns {Promise<Array<{dia: number, hora_inicio: string, hora_fin: string, duracion: number, activo: boolean}>>}
 */
router.get(
  '/profesionales/:professionalId/horarios-config',
  autenticarToken,
  async (req, res) => {
    try {
      const { professionalId } = req.params;

      if (!/^\d+$/.test(professionalId)) {
        return res.status(400).json({
          message: 'professionalId inválido'
        });
      }

      // Verificar acceso: administrativo o el propio profesional
      const usuarioId = String(req.user.id);
      const rol = String(req.user.rol ?? req.user.nivel ?? '').toLowerCase();
      const esAdministrativo = ['administrativo', 'admin'].includes(rol) || ['1', '10'].includes(rol);
      const esPropioProfesional = usuarioId === String(professionalId);

      if (!esAdministrativo && !esPropioProfesional) {
        return res.status(403).json({
          message: 'No tenés permiso para ver la configuración de horarios'
        });
      }

      // Buscar configuración personal del profesional
      const horariosPersonal = await pool.query(
        `SELECT dia, hora_inicio, hora_fin, duracion, activo
         FROM horarios_base
         WHERE usuario_id = ?
         ORDER BY dia ASC, hora_inicio ASC`,
        [professionalId]
      );

      // Si tiene configuración personal, devolverla
      if (horariosPersonal.length > 0) {
        return res.status(200).json(horariosPersonal);
      }

      // Si no tiene configuración personal, usar configuración base (L-V 8-18)
      const configuracionBase = [
        { dia: 1, hora_inicio: '08:00:00', hora_fin: '18:00:00', duracion: 30, activo: true },
        { dia: 2, hora_inicio: '08:00:00', hora_fin: '18:00:00', duracion: 30, activo: true },
        { dia: 3, hora_inicio: '08:00:00', hora_fin: '18:00:00', duracion: 30, activo: true },
        { dia: 4, hora_inicio: '08:00:00', hora_fin: '18:00:00', duracion: 30, activo: true },
        { dia: 5, hora_inicio: '08:00:00', hora_fin: '18:00:00', duracion: 30, activo: true },
      ];

      return res.status(200).json(configuracionBase);

    } catch (error) {
      console.error('Error al obtener configuración de horarios:', error);
      return res.status(500).json({
        message: 'Error al obtener la configuración de horarios'
      });
    }
  }
);

/**
 * Actualiza la configuración de horarios de un profesional.
 * Reemplaza toda la configuración existente.
 *
 * PUT /v1/profesionales/:id/horarios-config
 * Body: [{ dia, hora_inicio, hora_fin, duracion, activo }]
 *
 * @returns {Promise<{success: boolean, message: string}>}
 */
router.put(
  '/profesionales/:professionalId/horarios-config',
  autenticarToken,
  async (req, res) => {
    let conexion;

    try {
      const { professionalId } = req.params;
      const { horarios } = req.body;

      if (!/^\d+$/.test(professionalId)) {
        return res.status(400).json({
          message: 'professionalId inválido'
        });
      }

      // Verificar acceso: administrativo o el propio profesional
      const usuarioId = String(req.user.id);
      const rol = String(req.user.rol ?? req.user.nivel ?? '').toLowerCase();
      const esAdministrativo = ['administrativo', 'admin'].includes(rol) || ['1', '10'].includes(rol);
      const esPropioProfesional = usuarioId === String(professionalId);

      if (!esAdministrativo && !esPropioProfesional) {
        return res.status(403).json({
          message: 'No tenés permiso para modificar la configuración de horarios'
        });
      }

      if (!Array.isArray(horarios) || horarios.length === 0) {
        return res.status(400).json({
          message: 'Se requiere un array de horarios'
        });
      }

      // Validar cada horario
      for (const h of horarios) {
        if (!h.dia || h.dia < 1 || h.dia > 7) {
          return res.status(400).json({
            message: 'Día inválido (debe ser 1-7)'
          });
        }
        if (!h.hora_inicio || !/^\d{2}:\d{2}:\d{2}$/.test(h.hora_inicio)) {
          return res.status(400).json({
            message: 'hora_inicio inválida (formato HH:MM:SS)'
          });
        }
        if (!h.hora_fin || !/^\d{2}:\d{2}:\d{2}$/.test(h.hora_fin)) {
          return res.status(400).json({
            message: 'hora_fin inválida (formato HH:MM:SS)'
          });
        }
        if (!h.duracion || h.duracion < 5 || h.duracion > 180) {
          return res.status(400).json({
            message: 'duración inválida (entre 5 y 180 minutos)'
          });
        }
      }

      conexion = await pool.getConnection();
      await conexion.beginTransaction();

      // Eliminar configuración anterior
      await conexion.query(
        `DELETE FROM horarios_base WHERE usuario_id = ?`,
        [professionalId]
      );

      // Insertar nueva configuración
      for (const h of horarios) {
        await conexion.query(
          `INSERT INTO horarios_base (usuario_id, dia, hora_inicio, hora_fin, duracion, activo)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [professionalId, h.dia, h.hora_inicio, h.hora_fin, h.duracion, h.activo !== false]
        );
      }

      await conexion.commit();

      return res.status(200).json({
        success: true,
        message: 'Configuración de horarios actualizada correctamente'
      });

    } catch (error) {
      if (conexion) {
        await conexion.rollback();
      }
      console.error('Error al actualizar configuración de horarios:', error);
      return res.status(500).json({
        message: 'Error al actualizar la configuración de horarios'
      });
    } finally {
      if (conexion) {
        conexion.release();
      }
    }
  }
);

/**
 * Obtiene las excepciones de horarios de un profesional (bloqueos, vacaciones, feriados).
 *
 * GET /v1/profesionales/:id/horarios-excepciones?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD
 *
 * @returns {Promise<Array<{id: number, fecha: string, hora_inicio: string, hora_fin: string, tipo: string, motivo: string}>>}
 */
router.get(
  '/profesionales/:professionalId/horarios-excepciones',
  autenticarToken,
  async (req, res) => {
    try {
      const { professionalId } = req.params;
      const { fecha_desde, fecha_hasta } = req.query;

      console.log('GET excepciones - professionalId:', professionalId, 'req.user:', req.user);

      if (!/^\d+$/.test(professionalId)) {
        return res.status(400).json({
          message: 'professionalId inválido'
        });
      }

      // Verificar acceso: administrativo o el propio profesional
      const usuarioId = String(req.user.id);
      const rol = String(req.user.rol ?? req.user.nivel ?? '').toLowerCase();
      const esAdministrativo = ['administrativo', 'admin'].includes(rol) || ['1', '10'].includes(rol);
      const esPropioProfesional = usuarioId === String(professionalId);

      console.log('Autorización:', { usuarioId, professionalId, rol, esAdministrativo, esPropioProfesional });

      if (!esAdministrativo && !esPropioProfesional) {
        return res.status(403).json({
          message: 'No tenés permiso para ver las excepciones de horarios'
        });
      }

      let query = `
        SELECT id, fecha, hora_inicio, hora_fin, tipo, motivo
        FROM horarios_excepciones
        WHERE usuario_id = ?
      `;
      const params = [professionalId];

      if (fecha_desde) {
        query += ` AND fecha >= ?`;
        params.push(fecha_desde);
      }
      if (fecha_hasta) {
        query += ` AND fecha <= ?`;
        params.push(fecha_hasta);
      }

      query += ` ORDER BY fecha ASC, hora_inicio ASC`;

      const excepciones = await pool.query(query, params);

      console.log('Excepciones recuperadas:', excepciones.length);

      return res.status(200).json(excepciones);

    } catch (error) {
      console.error('Error al obtener excepciones de horarios:', error);
      console.error('Detalles:', {
        code: error.code,
        sqlMessage: error.sqlMessage,
        sqlState: error.sqlState
      });
      return res.status(500).json({
        message: 'Error al obtener las excepciones de horarios',
        error: error.sqlMessage || error.message
      });
    }
  }
);

/**
 * Crea una excepción de horario (bloqueo de fecha/horario específico).
 *
 * POST /v1/profesionales/:id/horarios-excepciones
 * Body: { fecha, hora_inicio?, hora_fin?, tipo, motivo }
 *
 * Tipos: 'vacacion', 'feriado', 'no_disponible', 'bloqueo_temporal'
 *
 * @returns {Promise<{success: boolean, message: string, id: number}>}
 */
router.post(
  '/profesionales/:professionalId/horarios-excepciones',
  autenticarToken,
  async (req, res) => {
    try {
      const { professionalId } = req.params;
      const { fecha, hora_inicio, hora_fin, tipo, motivo } = req.body;

      if (!/^\d+$/.test(professionalId)) {
        return res.status(400).json({
          message: 'professionalId inválido'
        });
      }

      // Verificar acceso: administrativo o el propio profesional
      const usuarioId = String(req.user.id);
      const rol = String(req.user.rol ?? req.user.nivel ?? '').toLowerCase();
      const esAdministrativo = ['administrativo', 'admin'].includes(rol) || ['1', '10'].includes(rol);
      const esPropioProfesional = usuarioId === String(professionalId);

      if (!esAdministrativo && !esPropioProfesional) {
        return res.status(403).json({
          message: 'No tenés permiso para crear excepciones de horarios'
        });
      }

      // Validaciones
      if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({
          message: 'Fecha inválida (formato YYYY-MM-DD)'
        });
      }

      if (!tipo || !['vacacion', 'feriado', 'no_disponible', 'bloqueo_temporal'].includes(tipo)) {
        return res.status(400).json({
          message: 'Tipo inválido (vacacion, feriado, no_disponible, bloqueo_temporal)'
        });
      }

      // Si es bloqueo parcial, validar horas
      if (tipo === 'bloqueo_temporal') {
        if (!hora_inicio || !/^\d{2}:\d{2}:\d{2}$/.test(hora_inicio)) {
          return res.status(400).json({
            message: 'hora_inicio requerida para bloqueo temporal (formato HH:MM:SS)'
          });
        }
        if (!hora_fin || !/^\d{2}:\d{2}:\d{2}$/.test(hora_fin)) {
          return res.status(400).json({
            message: 'hora_fin requerida para bloqueo temporal (formato HH:MM:SS)'
          });
        }
      }

      const resultado = await pool.query(
        `INSERT INTO horarios_excepciones
         (usuario_id, fecha, hora_inicio, hora_fin, tipo, motivo)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [professionalId, fecha, hora_inicio || null, hora_fin || null, tipo, motivo || null]
      );

      return res.status(201).json({
        success: true,
        message: 'Excepción de horario creada correctamente',
        id: Number(resultado.insertId)
      });

    } catch (error) {
      console.error('Error al crear excepción de horario:', error);
      console.error('Detalles del error:', {
        code: error.code,
        sqlMessage: error.sqlMessage,
        sqlState: error.sqlState
      });

      // Si la tabla no existe, dar un mensaje más claro
      if (error.code === 'ER_NO_SUCH_TABLE') {
        return res.status(500).json({
          message: 'La tabla horarios_excepciones no existe. Ejecuta el script SQL: create_horarios_tables.sql',
          error: error.sqlMessage
        });
      }

      return res.status(500).json({
        message: 'Error al crear la excepción de horario',
        error: error.sqlMessage || error.message
      });
    }
  }
);

/**
 * Elimina una excepción de horario.
 *
 * DELETE /v1/profesionales/:id/horarios-excepciones/:excepcionId
 *
 * @returns {Promise<{success: boolean, message: string}>}
 */
router.delete(
  '/profesionales/:professionalId/horarios-excepciones/:excepcionId',
  autenticarToken,
  async (req, res) => {
    try {
      const { professionalId, excepcionId } = req.params;

      if (!/^\d+$/.test(professionalId) || !/^\d+$/.test(excepcionId)) {
        return res.status(400).json({
          message: 'IDs inválidos'
        });
      }

      // Verificar acceso: administrativo o el propio profesional
      const usuarioId = String(req.user.id);
      const rol = String(req.user.rol ?? req.user.nivel ?? '').toLowerCase();
      const esAdministrativo = ['administrativo', 'admin'].includes(rol) || ['1', '10'].includes(rol);
      const esPropioProfesional = usuarioId === String(professionalId);

      if (!esAdministrativo && !esPropioProfesional) {
        return res.status(403).json({
          message: 'No tenés permiso para eliminar excepciones de horarios'
        });
      }

      // Verificar que la excepción pertenezca al profesional
      const excepcion = await pool.query(
        `SELECT id FROM horarios_excepciones
         WHERE id = ? AND usuario_id = ?`,
        [excepcionId, professionalId]
      );

      if (excepcion.length === 0) {
        return res.status(404).json({
          message: 'Excepción no encontrada'
        });
      }

      await pool.query(
        `DELETE FROM horarios_excepciones WHERE id = ?`,
        [excepcionId]
      );

      return res.status(200).json({
        success: true,
        message: 'Excepción de horario eliminada correctamente'
      });

    } catch (error) {
      console.error('Error al eliminar excepción de horario:', error);
      return res.status(500).json({
        message: 'Error al eliminar la excepción de horario'
      });
    }
  }
);

/**
 * Verifica si las tablas de horarios existen (endpoint de diagnóstico)
 *
 * GET /v1/sistema/horarios-check
 *
 * @returns {Promise<{horarios_base: boolean, horarios_excepciones: boolean}>}
 */
router.get('/sistema/horarios-check', async (req, res) => {
  try {
    const [baseTable] = await pool.query(
      `SELECT COUNT(*) as count FROM information_schema.tables
       WHERE table_schema = DATABASE()
       AND table_name = 'horarios_base'`
    );

    const [excepcionesTable] = await pool.query(
      `SELECT COUNT(*) as count FROM information_schema.tables
       WHERE table_schema = DATABASE()
       AND table_name = 'horarios_excepciones'`
    );

    return res.status(200).json({
      horarios_base: baseTable.count > 0,
      horarios_excepciones: excepcionesTable.count > 0
    });
  } catch (error) {
    console.error('Error al verificar tablas:', error);
    return res.status(500).json({
      message: 'Error al verificar tablas de horarios'
    });
  }
});

/**
 * Obtiene la disponibilidad real de un profesional para una fecha específica.
 * Combina configuración base + excepciones + turnos ya reservados.
 *
 * GET /v1/profesionales/:id/disponibilidad?fecha=YYYY-MM-DD
 *
 * @returns {Promise<{fecha: string, horarios: Array<{horario: string, disponible: boolean, motivo?: string}>}>}
 */
router.get(
  '/profesionales/:professionalId/disponibilidad',
  autenticarToken,
  async (req, res) => {
    try {
      const { professionalId } = req.params;
      const { fecha } = req.query;

      if (!/^\d+$/.test(professionalId)) {
        return res.status(400).json({
          message: 'professionalId inválido'
        });
      }

      if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({
          message: 'Fecha inválida (formato YYYY-MM-DD)'
        });
      }

      // Determinar día de la semana (1=Lunes, ..., 7=Domingo)
      const [anio, mes, dia] = fecha.split('-').map(Number);
      const fechaObj = new Date(anio, mes - 1, dia);
      const diaSemana = fechaObj.getDay() === 0 ? 7 : fechaObj.getDay();

      // 1. Obtener configuración base del profesional
      const configBase = await pool.query(
        `SELECT dia, hora_inicio, hora_fin, duracion, activo
         FROM horarios_base
         WHERE usuario_id = ? AND dia = ? AND activo = true
         LIMIT 1`,
        [professionalId, diaSemana]
      );

      // Si no tiene configuración personal, usar configuración base (L-V 8-18)
      let horarioConfig = configBase[0];
      if (!horarioConfig && diaSemana >= 1 && diaSemana <= 5) {
        horarioConfig = {
          hora_inicio: '08:00:00',
          hora_fin: '18:00:00',
          duracion: 30
        };
      }

      // Si no hay configuración para este día (sábado/domingo sin config personal)
      if (!horarioConfig) {
        return res.status(200).json({
          fecha,
          horarios: []
        });
      }

      // 2. Generar slots de tiempo basados en la configuración
      const slots = [];
      let [horaInicio, minutoInicio] = horarioConfig.hora_inicio.split(':').map(Number);
      const [horaFin, minutoFin] = horarioConfig.hora_fin.split(':').map(Number);
      const duracion = horarioConfig.duracion;

      while (true) {
        const horaActual = horaInicio * 60 + minutoInicio;
        const horaFinMinutos = horaFin * 60 + minutoFin;

        if (horaActual >= horaFinMinutos) break;

        const horaStr = `${String(horaInicio).padStart(2, '0')}:${String(minutoInicio).padStart(2, '0')}`;
        slots.push({
          horario: horaStr,
          disponible: true,
          motivo: null
        });

        // Avanzar duración
        minutoInicio += duracion;
        while (minutoInicio >= 60) {
          minutoInicio -= 60;
          horaInicio++;
        }
      }

      // 3. Obtener excepciones para esta fecha
      const excepciones = await pool.query(
        `SELECT hora_inicio, hora_fin, tipo, motivo
         FROM horarios_excepciones
         WHERE usuario_id = ? AND fecha = ?`,
        [professionalId, fecha]
      );

      // 4. Obtener turnos ya reservados
      const turnos = await pool.query(
        `SELECT hora
         FROM turnos
         WHERE id_usuario = ? AND fecha = ? AND estado != 'cancelado'`,
        [professionalId, fecha]
      );

      // 5. Marcar slots no disponibles
      const turnosOcupados = new Set(turnos.map(t => t.hora.slice(0, 5)));

      for (const exc of excepciones) {
        // Bloqueo total del día
        if (!exc.hora_inicio && !exc.hora_fin) {
          slots.forEach(s => {
            s.disponible = false;
            s.motivo = exc.motivo || exc.tipo;
          });
          break;
        }

        // Bloqueo parcial
        const horaInicioExc = exc.hora_inicio.slice(0, 5);
        const horaFinExc = exc.hora_fin ? exc.hora_fin.slice(0, 5) : null;

        slots.forEach(s => {
          if (!s.disponible) return;

          // Verificar si el slot está dentro del rango bloqueado
          if (s.horario >= horaInicioExc && (!horaFinExc || s.horario < horaFinExc)) {
            s.disponible = false;
            s.motivo = exc.motivo || exc.tipo;
          }
        });
      }

      // Marcar turnos ocupados
      slots.forEach(s => {
        if (turnosOcupados.has(s.horario)) {
          s.disponible = false;
          s.motivo = 'turno_reservado';
        }
      });

      return res.status(200).json({
        fecha,
        horarios: slots
      });

    } catch (error) {
      console.error('Error al obtener disponibilidad:', error);
      return res.status(500).json({
        message: 'Error al obtener la disponibilidad'
      });
    }
  }
);

export default router;