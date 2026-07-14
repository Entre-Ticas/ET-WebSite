---
# REGLAS ABSOLUTAS DE ARQUITECTURA, VARIABLES Y BASE DE DATOS

Este archivo contiene las reglas absolutas de arquitectura, variables y base de datos. Léelo con atención y bajo ninguna circunstancia sugieras patrones de código, nombres de variables o estructuras de datos distintos a los que están definidos aquí o en los archivos referenciados.

---

## 1. Stack Tecnológico Invariante
*   **Frontend:** HTML5, CSS3 Vanilla y JavaScript Vanilla (ES6+ sin frameworks).
*   **Hosting & Serverless:** Netlify (Netlify Functions para backend/API en `./netlify/functions/`).
*   **Base de Datos & Auth:** Supabase (PostgreSQL).

---

## 2. Directiva de Base de Datos (Supabase DDL)
La estructura oficial de la base de datos, incluyendo nombres exactos de tablas, columnas, tipos de datos y llaves foráneas (Foreign Keys), se encuentra en el archivo `./SQL/Structure.sql`. Debes leer el archivo `./SQL/Structure.sql` en su totalidad antes de generar cualquier consulta, código de inserción, actualización o lógica de negocio. Tienes estrictamente prohibido alucinar o inventar nombres de columnas o tablas que no estén explícitamente declarados en ese archivo SQL.

*Mapeo Crítico del Sistema (para tu consumo rápido basado en ./SQL/Structure.sql):*
- **Módulo de Inventario:** Tablas `products`, `product_category`, y `product_status`.
- **Módulo de Logística/Tracking:** Tablas `tracking`, `tracking_historial`, `stores`, y `status_tracking`.
- **Mantenimiento y Usuarios:** Tablas `maintenance`, `users` y `status`.
- **Funciones RPC Disponibles:** `get_available_products`, `get_all_trackings`, `get_tracking_by_guia`, `get_tracking_historial_by_guia`, `add_product`, `delete_product`, `get_maintenance_by_name_and_active`, entre otras.

---

## 3. Arquitectura de Conexión y Estado
*   **Conexión Frontend-Backend:** El frontend NO utiliza el SDK de Supabase. Toda la comunicación con la base de datos se realiza a través de peticiones `fetch` a las Netlify Functions alojadas en `./netlify/functions/`.
*   **Seguridad y Llaves:** Las Netlify Functions son el único punto de contacto con Supabase. Utilizan la `SUPABASE_SERVICE_ROLE_KEY` para todas las operaciones. Las acciones de administrador (POST, PUT, DELETE) están protegidas dentro de estas funciones mediante la verificación de un `x-admin-token` personalizado.
*   **Manejo Asíncrono:** Uso obligatorio de `async/await` estructurado dentro de bloques `try/catch`. Las peticiones se realizan con `fetch` y la respuesta se valida con `response.ok` antes de procesar el JSON con `response.json()`. No se utiliza la destructuración `{ data, error }` del SDK de Supabase.

---

## 4. Variables de Entorno (`.env`)
El proyecto depende de un archivo `.env` en la raíz para el desarrollo local. Estas variables DEBEN estar configuradas en el entorno de producción de Netlify.

*   **`SUPABASE_URL`**: La URL de la API de tu proyecto Supabase.
*   **`SUPABASE_SERVICE_ROLE_KEY`**: La clave de servicio (secreta) de Supabase. Se usa para operaciones de backend con permisos elevados.
*   **`SUPABASE_KEY`**: La clave anónima (pública) de Supabase, usada para operaciones de solo lectura sin privilegios.
*   **`ADMIN_SECRET`**: El secreto personalizado para firmar y verificar los tokens de sesión de administrador.
*   **`MIGRATION_SECRET`**: Una clave de seguridad de un solo uso para proteger scripts de mantenimiento críticos.

---
## 5. Estructura del Workspace
Este es el árbol de directorios del proyecto. Los archivos clave a consultar son los que se encuentran en `Public/assets/js/` para la lógica del frontend y `netlify/functions/` para la lógica del backend.
```
d:/WORK/Mike/git/ET-WebSite/
├── .gitignore
├── netlify/
│   └── functions/
│       ├── catalog-products.js
│       ├── catalog-status.js
│       ├── catalog.js
│       ├── info-image.js
│       ├── login.js
│       ├── migrate-passwords.js
│       ├── tracking-status.js
│       ├── tracking.js
│       └── user-admin.js
├── package-lock.json
├── package.json
├── Public/
│   ├── assets/
│   │   ├── css/
│   │   │   └── style.css
│   │   └── js/
│   │       ├── auth.js
│   │       ├── catalog-admin.js
│   │       ├── catalog.js
│   │       ├── infoImg.js
│   │       ├── main.js
│   │       └── tracking-admin.js
│   ├── Calc/
│   │   └── style.css
│   └── Catalog/
│       └── catalog.html
└── SQL/
    └── Structure.sql
```
---
---



