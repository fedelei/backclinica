-- Script de diagnóstico para verificar si las tablas de horarios existen
-- Ejecutar: mysql -u tu_usuario -p nombre_base_de_datos < check_tables.sql

SELECT
  'horarios_base' as tabla,
  COUNT(*) as existe
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = 'horarios_base'

UNION ALL

SELECT
  'horarios_excepciones' as tabla,
  COUNT(*) as existe
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = 'horarios_excepciones'

UNION ALL

SELECT
  'horarios (sistema viejo)' as tabla,
  COUNT(*) as existe
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = 'horarios';
