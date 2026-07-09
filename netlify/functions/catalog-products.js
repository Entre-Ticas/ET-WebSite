exports.handler = async function(event, context) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    // Usamos la SERVICE_ROLE_KEY para operaciones de escritura/administración
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Manejar solicitud GET para obtener todos los productos
    if (event.httpMethod === 'GET') {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_available_products`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });
            if (!response.ok) throw new Error(`Supabase error: ${await response.text()}`);
            const data = await response.json();

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: `GET Error: ${error.message}` }) };
        }
    }

    // Manejar solicitud POST para crear un nuevo producto
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body);

            const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/add_product`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    p_name: body.name,
                    p_category: body.category,
                    p_size: body.size,
                    p_price: body.price,
                    p_image_url: body.image_url,
                    p_initial_status_id: body.status_id
                })
            });

            if (!response.ok) throw new Error(`Supabase error: ${await response.text()}`);
            const data = await response.json();

            return {
                statusCode: 201, // 201 Created
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: `POST Error: ${error.message}` }) };
        }
    }

    // Manejar solicitud DELETE para eliminar un producto
    if (event.httpMethod === 'DELETE') {
        try {
            // Aquí podrías añadir validación del token de administrador si es necesario
            // const adminToken = event.headers['x-admin-token'];
            // if (!isValid(adminToken)) return { statusCode: 401, body: JSON.stringify({ message: 'No autorizado' })};

            const productId = event.queryStringParameters.id;
            if (!productId) {
                return { statusCode: 400, body: JSON.stringify({ message: 'ID de producto no proporcionado.' }) };
            }

            // Obtener la URL de la imagen del cuerpo de la solicitud
            const body = JSON.parse(event.body || '{}');
            const imageUrl = body.imageUrl;

            // Llama a la función RPC 'delete_product' en Supabase
            const dbResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_product`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ p_id: productId })
            });

            if (!dbResponse.ok) {
                throw new Error(`Error al eliminar de la base de datos: ${await dbResponse.text()}`);
            }

            // Si se proporcionó una URL de imagen, procedemos a borrarla del Storage
            if (imageUrl) {
                try {
                    // Extraemos el nombre del bucket y la ruta del archivo de la URL
                    const urlParts = new URL(imageUrl);
                    const pathParts = urlParts.pathname.split('/');
                    // La URL es /storage/v1/object/public/bucket-name/file-path
                    const bucketName = pathParts[5]; // El nombre del bucket es el 6to elemento
                    const filePath = pathParts.slice(6).join('/'); // El resto es la ruta del archivo

                    if (bucketName && filePath) {
                        const storageResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucketName}/${filePath}`, {
                            method: 'DELETE',
                            headers: {
                                'apikey': SUPABASE_KEY,
                                'Authorization': `Bearer ${SUPABASE_KEY}`
                            }
                        });
                        if (!storageResponse.ok) console.warn(`No se pudo eliminar el archivo del storage: ${await storageResponse.text()}`);
                    }
                } catch (storageError) {
                    // Si falla el borrado del storage, lo registramos pero no detenemos el proceso,
                    // ya que el registro de la BD ya fue eliminado.
                    console.warn(`El registro de la BD fue eliminado, pero falló la eliminación del archivo en Storage: ${storageError.message}`);
                }
            }

            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Producto eliminado correctamente.' })
            };

        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: `DELETE Error: ${error.message}` }) };
        }
    }

    return {
        statusCode: 405, // Method Not Allowed
        body: 'Método no permitido'
    };
};