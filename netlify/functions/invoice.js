// Endpoint público para ver el detalle de una factura (sin autenticación).
// Solo permite GET. Los clientes pueden ver su factura con el ID.

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sbHeaders = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido.' }) };
    }

    const invoiceId = event.queryStringParameters?.id;
    if (!invoiceId || isNaN(Number(invoiceId))) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Se requiere un id de factura válido.' }) };
    }

    try {
        // Obtener cabecera de la factura
        const invoiceRes = await fetch(
            `${supabaseUrl}/rest/v1/invoices?id=eq.${Number(invoiceId)}&select=*`,
            { headers: sbHeaders }
        );

        if (!invoiceRes.ok) throw new Error(`Error obteniendo la factura: ${await invoiceRes.text()}`);

        const invoices = await invoiceRes.json();
        if (!invoices.length) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Factura no encontrada.' }) };
        }

        const invoice = invoices[0];

        // Obtener nombre del estado
        if (invoice.id_status) {
            const statusRes = await fetch(
                `${supabaseUrl}/rest/v1/status?id_status=eq.${invoice.id_status}&select=status_name`,
                { headers: sbHeaders }
            );
            if (statusRes.ok) {
                const statuses = await statusRes.json();
                invoice.status_name = statuses[0]?.status_name || null;
            }
        }

        // Obtener artículos y abonos en paralelo
        const [itemsRes, paymentsRes] = await Promise.all([
            fetch(`${supabaseUrl}/rest/v1/order_items?invoice_id=eq.${Number(invoiceId)}&select=*`, { headers: sbHeaders }),
            fetch(`${supabaseUrl}/rest/v1/payments?invoice_id=eq.${Number(invoiceId)}&select=*`, { headers: sbHeaders })
        ]);

        const items = itemsRes.ok ? await itemsRes.json() : [];
        const payments = paymentsRes.ok ? await paymentsRes.json() : [];

        return {
            statusCode: 200,
            body: JSON.stringify({ invoice, items, payments })
        };
    } catch (error) {
        console.error('Error en invoice:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error interno del servidor.', details: error.message })
        };
    }
};
