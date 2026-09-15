const ADMIN_SECRET = () => process.env.ADMIN_SECRET;
const CLOUDFLARE_ACCOUNT_ID = () => process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_R2_BUCKET = () => process.env.CLOUDFLARE_R2_BUCKET;
const CLOUDFLARE_PUBLIC_URL = () => process.env.CLOUDFLARE_PUBLIC_URL;
const CLOUDFLARE_R2_ACCESS_KEY_ID = () => process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const CLOUDFLARE_R2_SECRET_ACCESS_KEY = () => process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

let s3Client = null;

function verifyToken(token) {
    if (!token || !ADMIN_SECRET()) return false;
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [secret, , expiry] = decoded.split(':');
        return secret === ADMIN_SECRET() && Date.now() <= parseInt(expiry);
    } catch { return false; }
}

function sanitizeFileName(fileName) {
    const sanitized = (fileName || 'upload.jpg')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return sanitized || 'upload';
}

function getR2UploadBaseUrl() {
    const accountId = CLOUDFLARE_ACCOUNT_ID();
    const bucket = CLOUDFLARE_R2_BUCKET();

    if (!accountId || !bucket) {
        return null;
    }

    return `https://${accountId}.r2.cloudflarestorage.com`;
}

function getPublicBaseUrl() {
    return CLOUDFLARE_PUBLIC_URL() ||
        (CLOUDFLARE_R2_BUCKET() ? `https://${CLOUDFLARE_R2_BUCKET()}.r2.dev` : null);
}

exports.handler = async (event) => {
    if (!verifyToken(event.headers['x-admin-token'])) {
        return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
    }

    const accessKeyId = CLOUDFLARE_R2_ACCESS_KEY_ID();
    const secretAccessKey = CLOUDFLARE_R2_SECRET_ACCESS_KEY();
    const bucket = CLOUDFLARE_R2_BUCKET();
    const uploadBaseUrl = getR2UploadBaseUrl();

    if (!bucket || !uploadBaseUrl) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Faltan variables de Cloudflare R2. Define CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_R2_BUCKET.'
            })
        };
    }

    if (!accessKeyId || !secretAccessKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Para upload directo en R2 necesitas CLOUDFLARE_R2_ACCESS_KEY_ID y CLOUDFLARE_R2_SECRET_ACCESS_KEY (los da la misma pantalla del API token).'
            })
        };
    }

    try {
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

        if (!s3Client) {
            s3Client = new S3Client({
                region: 'auto',
                endpoint: uploadBaseUrl,
                forcePathStyle: true,
                credentials: {
                    accessKeyId,
                    secretAccessKey
                }
            });
        }

        const fileName = event.headers['x-file-name'] || 'upload.jpg';
        const contentType = event.headers['content-type'] || 'application/octet-stream';

        if (!event.body) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Faltan datos del archivo (cuerpo).' })
            };
        }

        const key = `${Date.now()}-${sanitizeFileName(fileName)}`;
        const fileBuffer = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);

        await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: fileBuffer,
            ContentType: contentType
        }));

        const publicBaseUrl = getPublicBaseUrl();
        const imageUrl = publicBaseUrl
            ? `${publicBaseUrl.replace(/\/$/, '')}/${key}`
            : `${uploadBaseUrl}/${bucket}/${key}`;

        return {
            statusCode: 200,
            body: JSON.stringify({ imageUrl })
        };
    } catch (error) {
        console.error('Error en upload-image:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};