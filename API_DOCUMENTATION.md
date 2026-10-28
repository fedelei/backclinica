# Documentación de API - Sistema de Gestión de Turnos

## 📋 Índice
- [Autenticación](#autenticación)
- [Clínicas](#clínicas)
- [Especialidades](#especialidades)
- [Profesionales](#profesionales)
- [Turnos](#turnos)
- [Horarios](#horarios)

---

## 🔐 Autenticación

### **POST /authentication/login**
Inicia sesión de usuario.

**Body:**
```json
{
  "usuario": "nombre_usuario",
  "password": "contraseña"
}
```

**Respuesta:**
```json
{
  "token": "jwt_token",
  "user": {
    "id": 1,
    "usuario": "nombre_usuario",
    "rol": "profesional",
    "id_clinica": 1
  }
}
```

---

### **POST /authentication/signupcl**
Registra un nuevo usuario.

**Body:**
```json
{
  "usuario": "dr.garcia",
  "password": "Password123!",
  "nombre": "Juan",
  "apellido": "García",
  "nivel": 2,
  "rol": "Profesional",
  "id_clinica": 1,
  "especialidad": "Cardiología"
}
```

**Campos obligatorios:**
- `usuario` - Nombre de usuario único
- `password` - Contraseña
- `nombre` - Nombre del usuario
- `id_clinica` - ID de la clínica
- `especialidad` - Obligatorio si `rol = "Profesional"`

---

## 🏥 Clínicas

### **GET /v1/clinicas**
Obtiene todas las clínicas.

**Respuesta:**
```json
[
  {
    "id": 1,
    "nombre": "Clínica Central",
    "direccion": "Av. Rivadavia 4500",
    "localidad": "CABA",
    "telefono": "011-4901-2233"
  }
]
```

---

### **GET /v1/clinicas/:id/especialidades**
Obtiene las especialidades de una clínica.

**Parámetro:** `id` - ID de la clínica

**Respuesta:**
```json
[
  {
    "id": 1,
    "nombre": "Cardiología"
  },
  {
    "id": 2,
    "nombre": "Dermatología"
  }
]
```

---

## 🩺 Especialidades

### **POST /clinica/agregarespecialidad**
Asigna una especialidad a un profesional.

**Body:**
```json
{
  "usuarioid": 123,
  "nombre": "Cardiología",
  "id_clinica": 1
}
```

**Funcionamiento:**
- Busca si la especialidad existe en la clínica
- Si no existe, la crea
- Crea la relación profesional-especialidad
- No duplica si ya existe

---

## 👨‍⚕️ Profesionales

### **GET /v1/profesionales?clinicaId=X&especialidad=Y**
Busca profesionales por clínica y especialidad (público).

**Parámetros query:**
- `clinicaId` - ID de la clínica
- `especialidad` - Nombre de la especialidad

**Respuesta:**
```json
[
  {
    "id": 1,
    "firstName": "Juan",
    "lastName": "García",
    "specialty": "Cardiología"
  }
]
```

---

### **GET /v1/clinicas/:clinicId/profesionales**
Obtiene profesionales de una clínica (requiere autenticación).

**Parámetro:** `clinicId` - ID de la clínica

**Headers:**
- `Authorization: Bearer <token>`

**Respuesta:**
```json
[
  {
    "id": 1,
    "firstName": "Juan",
    "lastName": "García",
    "specialty": "Cardiología, Dermatología"
  }
]
```

---

## 📅 Turnos

### **POST /v1/turnos**
Crea un nuevo turno (público o autenticado).

**Body:**
```json
{
  "professionalId": 1,
  "patientId": 1,
  "date": "2026-10-16",
  "time": "11:00",
  "status": "confirmado",
  "reason": "Consulta general",
  "patientName": "Roberto Díaz",
  "patientDni": "30456789",
  "patientEmail": "roberto@email.com",
  "patientPhone": "011-5555-1001",
  "healthInsurance": "OSDE"
}
```

**Campos obligatorios:**
- `professionalId` - ID del profesional
- `date` - Fecha (YYYY-MM-DD)
- `time` - Hora (HH:mm)

---

### **PUT /v1/turnos/:appointmentId**
Edita un turno existente.

**Parámetro:** `appointmentId` - ID del turno

**Headers:**
- `Authorization: Bearer <token>`

**Body:** Igual que POST

---

### **PATCH /v1/turnos/:appointmentId/cancelar**
Cancela un turno.

**Parámetro:** `appointmentId` - ID del turno

**Headers:**
- `Authorization: Bearer <token>`

**Respuesta:**
```json
{
  "id": "1",
  "status": "cancelado",
  "updatedAt": "2026-10-16T10:00:00.000Z"
}
```

---

### **GET /v1/turnos**
Obtiene turnos con filtros (requiere autenticación).

**Parámetros query:**
- `clinicId` - ID de la clínica
- `professionalId` - ID del profesional
- `date` - Fecha específica

**Headers:**
- `Authorization: Bearer <token>`

---

## ⏰ Horarios

### **GET /v1/profesionales/:professionalId/horarios-config**
Obtiene la configuración de horarios de un profesional.

**Parámetro:** `professionalId` - ID del profesional

**Headers:**
- `Authorization: Bearer <token>`

**Respuesta:**
```json
[
  {
    "dia": 1,
    "hora_inicio": "08:00:00",
    "hora_fin": "12:00:00",
    "duracion": 30,
    "activo": true
  }
]
```

**Días:** 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado, 7=Domingo

---

### **PUT /v1/profesionales/:professionalId/horarios-config**
Actualiza la configuración de horarios de un profesional.

**Parámetro:** `professionalId` - ID del profesional

**Headers:**
- `Authorization: Bearer <token>`

**Body:**
```json
[
  {
    "dia": 1,
    "hora_inicio": "08:00:00",
    "hora_fin": "12:00:00",
    "duracion": 30,
    "activo": true
  },
  {
    "dia": 2,
    "hora_inicio": "16:00:00",
    "hora_fin": "18:00:00",
    "duracion": 30,
    "activo": true
  }
]
```

---

### **GET /v1/profesionales/:id/disponibilidad?fecha=YYYY-MM-DD**
Obtiene los horarios disponibles de un profesional para una fecha específica.

**Parámetros:**
- `id` - ID del profesional
- `fecha` - Fecha (YYYY-MM-DD)

**Headers:**
- `Authorization: Bearer <token>`

**Respuesta:**
```json
{
  "fecha": "2026-10-16",
  "horarios": [
    {
      "hora": "08:00",
      "disponible": true
    },
    {
      "hora": "08:30",
      "disponible": false
    }
  ]
}
```

---

## 🎨 Servicios del Frontend

El frontend usa servicios centralizados para comunicarse con el backend.

### **authService.js**
Gestión de autenticación.

**Funciones:**
- `login(clinicId, username, password)` - Inicia sesión
- `logout()` - Cierra sesión
- `getCurrentSession()` - Obtiene sesión guardada
- `validateSession()` - Valida sesión contra servidor

---

### **panelService.js**
Gestión del panel de administración.

**Funciones:**
- `fetchProfessionalsByClinic(clinicId)` - Obtiene profesionales de una clínica
- `fetchAppointmentsByClinic(clinicId)` - Obtiene turnos de una clínica

---

### **appointmentService.js**
Gestión de turnos.

**Funciones:**
- `createAppointment(data)` - Crea nuevo turno
- `updateAppointment(appointmentId, data)` - Edita turno
- `cancelAppointment(appointmentId)` - Cancela turno
- `fetchAppointments(params)` - Obtiene turnos con filtros

---

### **horariosService.js**
Gestión de horarios de profesionales.

**Funciones:**
- `getHorariosConfig(professionalId)` - Obtiene configuración de horarios
- `updateHorariosConfig(professionalId, data)` - Actualiza horarios
- `getDisponibilidad(professionalId, fecha)` - Obtiene disponibilidad
- `getExcepciones(professionalId)` - Obtiene excepciones
- `addExcepcion(professionalId, data)` - Agrega excepción
- `deleteExcepcion(professionalId, excepcionId)` - Elimina excepción

---

## 📝 Notas Importantes

### **Autenticación**
- Para endpoints que requieren autenticación, enviar el header:
  ```
  Authorization: Bearer <token>
  ```
- El token se obtiene al hacer login en `/authentication/login`

### **Roles**
- `administrativo` - Acceso completo a la clínica
- `profesional` - Acceso a sus propios horarios y turnos

### **Errores Comunes**
- `400` - Datos inválidos o faltantes
- `401` - No autenticado
- `403` - Sin permisos
- `404` - Recurso no encontrado
- `500` - Error del servidor

### **URL Base**
```
http://tu-dominio.com:4000
```

---

## 🚀 Ejemplo Rápido

### **1. Login**
```bash
POST /authentication/login
{
  "usuario": "admin",
  "password": "password123"
}
```

### **2. Obtener profesionales**
```bash
GET /v1/profesionales?clinicaId=1&especialidad=Cardiología
```

### **3. Crear turno**
```bash
POST /v1/turnos
{
  "professionalId": 1,
  "date": "2026-10-16",
  "time": "11:00",
  "patientName": "Juan Pérez"
}
```

---

*Última actualización: Octubre 2026*
