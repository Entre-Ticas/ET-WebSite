# Implementation Plan v3 (final): Time-Limited Catalog — Entre Ticas

> Documento único que junta v1 (arquitectura y backend) + v2 (panel de administración STORE-ADMIN) + todas las decisiones tomadas en la revisión. No hace falta volver a v1/v2 — este es el que se usa para construir.

## 1. Flujo real

El dueño visita varias tiendas físicas en secuencia:

1. Llega a la tienda 1, fotografía todo lo que quiere vender, activa el catálogo (arranca el reloj de 1 hora).
2. Se mueve a la tienda 2, prepara (carga fotos de) el catálogo 2 pero **no lo activa todavía**.
3. Se cumple la hora de la tienda 1 → vuelve a la tienda 1 a comprar/recoger lo que los clientes pidieron.
4. Se mueve a la tienda 3, prepara el catálogo 3 (el catálogo de la tienda 2 puede seguir activo o no haberse activado aún).
5. Se cumple la hora de la tienda 2 → activa el catálogo 3 y va a la tienda 2 a comprar/recoger lo que pidieron.

Conclusión de diseño: **"crear/preparar" una tienda y "activarla" son dos acciones separadas**, y pueden existir varias tiendas en distintos estados al mismo tiempo (preparando, activa, expirada) — pero, según el flujo real, **nunca dos tiendas activas a la vez**: siempre se activa la siguiente cuando la anterior ya expiró.

## 2. Decisiones de arquitectura

| Tema | Decisión |
|---|---|
| Fotos del catálogo | Cloudflare R2 ($0 egress — evita el problema de cuota que ya tuvo Supabase Storage) |
| Aviso de compra | Cliente → empresa por WhatsApp, vía link `wa.me` prellenado (canal principal, sin cambios) |
| Verificación de pedidos | Manual, siempre presente: página admin que lista pedidos agrupados por tienda |
| Notificaciones en tiempo real (push/Telegram/email) | **No se implementa** — no hace falta dado el flujo real |
| Modelo de link | Un link por tienda/lote (no por cliente); varios clientes pueden usar el mismo link dentro de la hora |
| Arranque del countdown | Cuando el dueño **activa** la tienda (no cuando cada cliente abre el link) — todos los clientes ven el mismo corte |
| Carrito de compras | `sessionStorage` en el navegador del cliente — no se persiste en base de datos, se limpia al cerrar la pestaña |
| Validación de expiración | Siempre server-side, en cada carga del catálogo y en cada intento de compra — nunca se confía en el reloj del cliente |
| UI del carrito | Clon del formato de resumen de pedido existente en `entreticas.netlify.app/catalog`, adaptado a este flujo |
| Depósito | El resumen del carrito muestra un monto de depósito del 50% requerido para colocar el pedido, además de precio/cantidad/subtotal por item |
| URL pública del catálogo | `entreticas.netlify.app/StoreCatalog/{public_token}` — verificar el path exacto al implementar |

## 3. Modelo de datos (Supabase — solo texto/metadata, sin fotos)

### Tabla `stores`
*(tabla existente, se extiende con los campos nuevos del catálogo)*
- `id_store` (uuid, PK)
- `nombre_tienda` (text)
- `status` (`draft` | `active` | `expired`)
- `public_token` (text, único) — usado en la URL pública del catálogo, nunca se expone el `id_store` directamente
- `created_at` (timestamp)
- `activated_at` (timestamp, null hasta que se activa)
- `expires_at` (timestamp, null hasta que se activa — se calcula como `activated_at + 1 hora`)

### Tabla `store_items`
- `id` (uuid, PK)
- `store_id` (FK → `stores.id_store`)
- `name` (text)
- `price` (numeric)
- `image_url` (text — URL pública en Cloudflare R2)
- `quantity` (numeric)
- `description` (text) — ej. "solo tallas de niño" o "solo queda talla 15"

### Tabla `store_orders`
*(una fila por item comprado, no un blob jsonb)*
- `id` (uuid, PK)
- `order_group_id` (uuid) — agrupa todas las filas de item del mismo checkout
- `store_id` (FK → `stores.id_store`)
- `item_id` (FK → `store_items`)
- `client_phone` (text)
- `quantity` (numeric)
- `unit_price` (numeric) — precio al momento de la compra
- `created_at` (timestamp)

> **Fase 2 (no ahora — queda para después):** una futura tabla `client` (`id_client`, phone, name), y enlazar `store_orders` con el sistema de Orders/Invoice/Payments que ya existe. Se deja comentado por ahora.

## 4. Netlify Functions

### `create-store` (admin)
Recibe el nombre de la tienda. Crea la fila en `stores` con `status = draft`, genera el `public_token`, sin tocar `activated_at`/`expires_at`.

### `activate-store` (admin)
Acción separada, disparada cuando el dueño está listo para compartir el link. Antes de activar, revisa si hay otra tienda en `status = active` (ver flujo completo en la sección 5.2). Al activar: `activated_at = now()`, `expires_at = now() + 1h`, `status = active`.

### `add-store-item` (admin)
Recibe los datos de **un** item (nombre, cantidad, precio, descripción) más la foto. Sube la foto a Cloudflare R2, obtiene el link público, y guarda la fila completa en `store_items` con ese `image_url`. Se llama una vez por cada item cargado (ver flujo detallado en 5.3).

### `update-store-item` / `delete-store-item` (admin)
Editan o eliminan un item de `store_items` por `id`. Disponibles sin importar el estado de la tienda (`draft`, `active` o `expired`).

### `get-store` (público)
Dado el `public_token` del link, valida `status = active` y `now() < expires_at` contra el reloj del **servidor**. Si no es válido, responde 410 (expirado). Si es válido, devuelve los items y `expires_at` para que el frontend arme el countdown.

### `create-order` (checkout, público)
Al presionar "comprar": **revalida** `status`/`expires_at` server-side otra vez (nunca se confía en el timer que ya corrió en el navegador — pudo haber sido manipulado o desincronizado). Si expiró, rechaza la compra aunque el carrito tenga items. Si es válida, inserta una fila de `store_orders` por cada item (compartiendo el mismo `order_group_id`) y devuelve el link `wa.me` con el mensaje prellenado para que el cliente lo mande.

## 5. Panel STORE-ADMIN

### 5.1 Grid principal
Lista **todas** las tiendas existentes, sin importar su estado (draft / activa / expirada).

Cada card muestra:
- Nombre de la tienda
- Badge de estado: **Borrador** / **Activa (countdown mm:ss)** / **Expirada**

Botones por card (visibilidad según estado):
- **Abrir tienda** — siempre visible. Lleva al formulario de carga de items (uno por uno, ver 5.3).
- **Ver items** — siempre visible. Lleva a la lista de items ya cargados en esa tienda (ver 5.4).
- **Activar** — solo visible si `status = draft`. Ver flujo en 5.2.
- **Cerrar** — solo visible si `status = active`. Fuerza `status = expired` de inmediato (independiente del countdown natural), para cuando el dueño ya terminó de recoger pedidos antes de que se cumpla la hora. Esto **solo bloquea el acceso público y nuevas compras** — no toca ni borra nada de `store_items` ni de `store_orders`: todos los pedidos ya generados mientras la tienda estaba activa quedan intactos y siguen visibles en el panel de "pedidos por tienda" (sección 9). "Cerrar" es puramente un cambio de estado, no una limpieza de datos.
- **WhatsApp / Copiar link** — solo visible si `status = active`. Copia `entreticas.netlify.app/StoreCatalog/{public_token}` al portapapeles (celular o computadora) para pegarlo directo en WhatsApp.

Botón adicional fuera del grid: **+ Nueva tienda** — abre un modal simple (solo nombre) y llama a `create-store`, creando la fila en `draft`.

### 5.2 Flujo de creación y activación

**Crear/abrir una tienda en `draft` no depende de ninguna otra tienda.** Se puede crear una tienda nueva o seguir cargando items en una que ya está en borrador aunque haya otra tienda activa en ese momento — esto nunca dispara ningún aviso. Coincide con el flujo real: se prepara la tienda 3 mientras la tienda 2 sigue activa, sin activarla todavía.

**Activar una tienda** es la única acción que sí depende del estado de las demás, porque en el flujo real solo se activa el siguiente catálogo cuando el anterior ya expiró (nunca hay dos activas al mismo tiempo). Al presionar **Activar** en una tienda en `draft`:
1. El frontend consulta si hay otra tienda actualmente en `active`.
2. Si la hay, muestra un modal: *"La tienda [X] está activa ahora mismo. ¿Deseas cerrarla y activar esta, o dejar esta en modo borrador por ahora?"* con dos opciones:
   - **Cerrar [X] y activar esta** — fuerza `status = expired` en la tienda activa, luego activa la nueva: `activated_at = now()`, `expires_at = now() + 1h`, `status = active`.
   - **Dejar en borrador** — no activa nada; la tienda queda en `draft` para activarla más tarde (cuando la otra expire sola o la cierres manualmente con **Cerrar**).
3. Si no hay ninguna otra tienda activa, se activa directo, sin modal.

**Reactivar una tienda expirada (reutilización):** por ahora no hay "clonar/duplicar" tienda — para volver a usar la misma tienda en una visita futura al mismo comercio, se reactiva la existente. Si esa tienda todavía tiene items cargados de la visita anterior, el modal de activación avisa: *"Esta tienda tiene [N] item(s) de una carga anterior. ¿Deseas eliminarlos antes de activar?"* con opciones **Eliminar items viejos y activar** / **Conservarlos y activar** / **Cancelar**.

### 5.3 Carga de items (uno por uno)
Se carga item por item, no en lote — cada item lleva foto, nombre, descripción, cantidad, precio, etc., así que un formulario de "agregar y siguiente" es más manejable y menos propenso a error que una carga masiva.

Flujo exacto por cada item, al presionar **Guardar**:
1. Se bloquea el botón de guardar de inmediato (evita doble-submit).
2. Se sube la foto a Cloudflare R2.
3. R2 devuelve el link público de la imagen.
4. Ese link se asigna al campo `image_url` del objeto en memoria (junto con el resto de los campos ya llenados: nombre, cantidad, precio, descripción, etc.).
5. Se guarda ese objeto completo como fila nueva en `store_items` (función `add-store-item`).
6. Se limpia el formulario y se desbloquea el botón, listo para el siguiente item.

> Nota para el build: en `entreticas.netlify.app/admin/order` (Order Items) ya existe la modalidad de **"Subir foto" o "Tomar foto"** para cargar la imagen de un item — este nuevo flujo debe ofrecer las mismas dos opciones.

### 5.4 Ver / administrar items de una tienda
Pantalla nueva (accesible desde **Ver items** en el grid): lista todos los items ya cargados de esa tienda específica, con:
- **Editar** un item individual (precio, cantidad, foto, descripción, etc.) — evita tener que borrar y recrearlo, que sería engorroso con hasta 250 items.
- Selección múltiple (checkboxes) para eliminar varios a la vez.
- Opción de "eliminar todos los items" de la tienda.

**Editar y eliminar están disponibles sin importar el estado de la tienda** (`draft`, `active` o `expired`) — no se bloquean cuando la tienda ya está activa.

## 6. Validación de expiración (catálogo público)

Cada vez que alguien entra a `entreticas.netlify.app/StoreCatalog/{public_token}`, se valida contra el reloj del **servidor** que la tienda no esté expirada — nunca se confía en el reloj del cliente. La misma validación se repite en el momento de comprar (`create-order`).

## 7. Frontend (catálogo público)

1. Pide el número de teléfono del cliente al entrar.
2. Carga los items de la tienda vía `get-store`.
3. El cliente agrega/quita items → el carrito vive en `sessionStorage` (persiste solo mientras la pestaña está abierta).
4. Countdown: se calcula **una vez** al cargar, comparando el `expires_at` del servidor contra la hora local, y corre con `setInterval` mostrando mm:ss.
5. Cuando quedan menos de 5 minutos, se dispara un modal de aviso.
6. Al cumplirse el tiempo, se bloquea la vista del catálogo y cualquier intento de compra, aunque el carrito todavía tenga items.
7. Al comprar: modal de confirmación con el resumen del carrito → clic en comprar → llama a `create-order` → si se acepta, genera y abre el link `wa.me` para que el cliente lo mande a la empresa.
8. Guard de `beforeunload`: si el carrito tiene al menos un item, cerrar la pestaña/navegador (o salir de la página) dispara la confirmación nativa del navegador ("¿salir del sitio?"), avisando al cliente que tiene items en el carrito. Solo activo mientras el carrito no esté vacío.

## 8. UI del carrito de compras

### 8.1 Botón de carrito (barra de navegación)
- Vive en el menú de navegación superior, a la derecha, como último elemento (por ahora — un solo carrito compartido entre todas las tiendas/catálogos).
- Cada vez que se agrega un item, el ícono del carrito muestra una animación de badge flotante (`+1` / `+N`) que aparece y se desvanece, dando feedback visual sin salir de la grilla de productos.

### 8.2 Tarjeta de producto — botón "agregar al carrito"
- Estado por defecto: el botón dice **"Agregar al carrito"** (reemplaza el actual "Lo quiero"), flotando dentro del área de la imagen del producto (mismo estilo de ubicación que el catálogo actual).
- Al primer clic: el botón se transforma en un stepper de cantidad — `[ - ]  cant.  [ + ]` — igual al stepper que ya se usa en `entreticas.netlify.app/admin/order` (Order Items). No hace falta un botón separado de "quitar": bajar con `-` hasta 0 quita el item del carrito.
- El stepper se queda flotando dentro del área de la imagen, reemplazando al botón en el mismo lugar (sin mover el layout).

### 8.3 Página de carrito (clon del formato de Resumen de Pedido existente)
Reutiliza el formato visual ya activo en `entreticas.netlify.app/catalog` (encabezado de tarjeta, filas de item con miniatura + nombre + cant. × precio, línea divisoria, bloque de totales). Adaptado a este flujo:
- Cada fila: foto del item, nombre, cantidad, precio unitario (sin línea de color/talla — se reemplaza por el campo `description` del item cuando existe).
- **Subtotal / Total** — suma de `cantidad × precio_unitario` de todos los items (ej. 2 × ₡5,000 + 1 × ₡2,500 = ₡12,500). No hay envío/impuestos en este negocio, así que Subtotal y Total son la misma cifra — reemplaza las filas de Envío/Impuestos/Código-promo del diseño de referencia, que no aplican acá.
- **Depósito (50%)** — calculado como el 50% de ese total (ej. ₡12,500 → ₡6,250). Es el monto que el cliente debe pagar por adelantado para colocar el pedido, y debe mostrarse en una **fuente más grande que cualquier otro monto del resumen** (más grande que las líneas de item y que el Total) — es el número que el cliente realmente necesita accionar.

## 9. Panel admin: pedidos por tienda

Página que lista pedidos agrupados por `store_id`. El dueño la revisa cada vez que vuelve a una tienda, para saber exactamente qué comprar/recoger — este es el paso manual de verificación permanente, independiente de si el mensaje de WhatsApp realmente llegó.

## 10. Orden de construcción sugerido

0. **Antes de tocar código:** leer `LLM_CONTEXT.md` (archivo dentro del proyecto con las convenciones y forma de trabajar ya establecidas). Ningún paso de abajo empieza sin haber leído ese archivo primero.
1. Modelo de datos en Supabase (extender `stores` con `public_token`, `activated_at`, `expires_at`, `status`; crear `store_items`, `store_orders`)
2. Subida de fotos a Cloudflare R2 (bucket + flujo de subida)
3. Functions `create-store`, `activate-store`, `add-store-item`, `update-store-item`, `delete-store-item` (admin)
4. Agregar la opción **STORE-ADMIN** al menú de navegación del panel admin
5. Panel STORE-ADMIN: grid con badges de estado y los 5 botones por card (sección 5.1)
6. Pantalla "Abrir tienda" — formulario de carga de item uno por uno (sección 5.3)
7. Pantalla "Ver items" — listado con editar, selección múltiple y eliminar (sección 5.4)
8. Function `get-store` (pública) + página `StoreCatalog/{public_token}`
9. Frontend: catálogo, carrito y countdown (botón de carrito, stepper, página de carrito — secciones 7 y 8)
10. Function `create-order` (checkout con revalidación server-side)
11. Panel admin: pedidos por tienda (sección 9)

## 11. Puntos críticos a tener en cuenta

- La expiración se valida **siempre** contra el reloj del servidor, tanto al ver el catálogo como al comprar. El reloj del navegador del cliente nunca es la fuente de verdad.
- "Crear/preparar" y "activar" una tienda son acciones separadas — esto permite tener varias tiendas en distintos estados a la vez, como requiere el flujo real. Pero **activar** sí depende de que no haya otra activa al mismo tiempo (nunca dos activas simultáneas).
- Las fotos nunca tocan Supabase — viven en Cloudflare R2 ($0 egress) para no repetir el problema de cuota anterior.
- El carrito es solo de sesión (`sessionStorage`); no hace falta persistirlo en base de datos.
- `store_orders` es una fila por item comprado (no un array jsonb), para que sea consultable y quede listo para enlazarse al sistema de Orders/Invoice/Payments existente en la Fase 2.
- "Cerrar" una tienda es solo un cambio de estado — nunca borra `store_items` ni `store_orders`.
- Editar y eliminar items funciona en cualquier estado de la tienda, no solo en `draft`.
- Reactivar una tienda con items viejos siempre avisa antes de decidir si se eliminan o se conservan.
- La UI del carrito reutiliza el componente/estilo de Resumen de Pedido existente en `entreticas.netlify.app/catalog` en vez de un diseño nuevo — mantener consistencia visual, solo cambiar la sección de totales por la línea de depósito del 50%.
- **Todo lo nuevo debe usar lo que ya existe en el proyecto, no crear cosas desde cero**: mismo CSS/estilos, misma estructura de páginas, mismos componentes de modal, mismos floating labels en los formularios, mismo stepper de cantidad. Esto aplica a cada pantalla nueva (grid STORE-ADMIN, "Abrir tienda", "Ver items", catálogo público, carrito).
- **Hay que agregar la nueva opción "STORE-ADMIN" al menú de navegación** del panel admin — no es una pantalla suelta, tiene que quedar accesible desde el menú como las demás secciones.
- **Antes de empezar a construir, leer `LLM_CONTEXT.md`** (archivo del proyecto con las convenciones de cómo se hacen las cosas) — es el primer paso, ver sección 10, punto 0.
