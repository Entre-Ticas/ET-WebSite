const crypto = require('crypto');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const sbHeaders = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
};

function toBase64Url(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(text) {
    const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, 'base64');
}

function normalizeName(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
    return String(value || '').replace(/\D+/g, '');
}

function fingerprint(value) {
    return toBase64Url(crypto.createHash('sha256').update(value).digest().subarray(0, 12));
}

function signEncodedPayload(encodedPayload) {
    return toBase64Url(
        crypto
            .createHmac('sha256', ADMIN_SECRET)
            .update(encodedPayload)
            .digest()
    );
}

function timingSafeEquals(a, b) {
    const left = Buffer.from(a || '', 'utf8');
    const right = Buffer.from(b || '', 'utf8');
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function createInvoiceReference(invoice) {
    const id = Number(invoice?.id || 0);
    const nameHash = fingerprint(normalizeName(invoice?.client_name));
    const phoneHash = fingerprint(normalizePhone(invoice?.client_phone));
    const payload = `${id}:${nameHash}:${phoneHash}`;
    const encodedPayload = toBase64Url(Buffer.from(payload, 'utf8'));
    const signature = signEncodedPayload(encodedPayload);
    return `inv_${encodedPayload}.${signature}`;
}

function parseAndVerifyReference(reference) {
    if (!reference || typeof reference !== 'string') return null;
    if (!reference.startsWith('inv_')) return null;

    const raw = reference.slice(4);
    const dotIndex = raw.lastIndexOf('.');
    if (dotIndex <= 0) return null;

    const encodedPayload = raw.slice(0, dotIndex);
    const providedSignature = raw.slice(dotIndex + 1);
    const expectedSignature = signEncodedPayload(encodedPayload);

    if (!timingSafeEquals(providedSignature, expectedSignature)) {
        return null;
    }

    let decoded;
    try {
        decoded = fromBase64Url(encodedPayload).toString('utf8');
    } catch (_e) {
        return null;
    }

    const [idText, nameHash, phoneHash] = decoded.split(':');
    const invoiceId = Number(idText);
    if (!Number.isFinite(invoiceId) || invoiceId <= 0 || !nameHash || !phoneHash) {
        return null;
    }

    return { invoiceId, nameHash, phoneHash };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido.' }) };
    }

    const ref = event.queryStringParameters?.ref;
    const parsedRef = parseAndVerifyReference(ref);
    if (!parsedRef) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Referencia inválida.' }) };
    }

    try {
        const invoiceRes = await fetch(
            `${supabaseUrl}/rest/v1/invoices?id=eq.${parsedRef.invoiceId}&select=*`,
            { headers: sbHeaders }
        );

        if (!invoiceRes.ok) throw new Error(`Error obteniendo la factura: ${await invoiceRes.text()}`);

        const invoices = await invoiceRes.json();
        if (!invoices.length) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Factura no encontrada.' }) };
        }

        const invoice = invoices[0];
        const expectedNameHash = fingerprint(normalizeName(invoice.client_name));
        const expectedPhoneHash = fingerprint(normalizePhone(invoice.client_phone));

        if (
            !timingSafeEquals(parsedRef.nameHash, expectedNameHash) ||
            !timingSafeEquals(parsedRef.phoneHash, expectedPhoneHash)
        ) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Referencia inválida.' }) };
        }

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

        const [itemsRes, paymentsRes] = await Promise.all([
            fetch(`${supabaseUrl}/rest/v1/order_items?invoice_id=eq.${parsedRef.invoiceId}&select=*`, { headers: sbHeaders }),
            fetch(`${supabaseUrl}/rest/v1/payments?invoice_id=eq.${parsedRef.invoiceId}&select=*`, { headers: sbHeaders })
        ]);

        const items = itemsRes.ok ? await itemsRes.json() : [];
        const payments = paymentsRes.ok ? await paymentsRes.json() : [];

        invoice.public_ref = createInvoiceReference(invoice);

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
