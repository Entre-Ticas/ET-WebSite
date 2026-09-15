const { handleStoreRequest } = require('./store-catalog-shared');

exports.handler = async (event) => {
  const body = event.body ? JSON.parse(event.body || '{}') : {};
  body.action = 'delete-store-item';
  return handleStoreRequest({
    httpMethod: event.httpMethod,
    headers: event.headers || {},
    queryStringParameters: { ...(event.queryStringParameters || {}), action: 'delete-store-item' },
    body,
  });
};
