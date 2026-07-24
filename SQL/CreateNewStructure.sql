WITH tablas AS (
    -- 1. Obtener la definición de las tablas
    SELECT 
        1 AS orden,
        '-- ==========================================' || CHR(10) ||
        '-- TABLA: ' || table_name || CHR(10) ||
        '-- ==========================================' || CHR(10) ||
        'CREATE TABLE IF NOT EXISTS public.' || table_name || ' (' || CHR(10) ||
        string_agg('  ' || column_name || ' ' || data_type || 
            CASE 
                WHEN character_maximum_length IS NOT NULL THEN '(' || character_maximum_length || ')'
                ELSE ''
            END || 
            CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END, ',' || CHR(10)) ||
        CHR(10) || ');' || CHR(10) AS definicion
    FROM information_schema.columns
    WHERE table_schema = 'public'
    GROUP BY table_name
),
funciones AS (
    -- 2. Obtener la definición de funciones y procedimientos
    SELECT 
        2 AS orden,
        '-- ==========================================' || CHR(10) ||
        '-- FUNCION / SP: ' || p.proname || CHR(10) ||
        '-- ==========================================' || CHR(10) ||
        pg_get_functiondef(p.oid) || ';' || CHR(10) AS definicion
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
)
-- Unimos todo en un solo resultado ordenado
SELECT definicion AS "Script SQL Completo"
FROM (
    SELECT orden, definicion FROM tablas
    UNION ALL
    SELECT orden, definicion FROM funciones
) sub
ORDER BY orden;