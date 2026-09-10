const { handleStoreRequest } = require('./store-catalog-shared');

exports.handler = async (event) => {
  const body = event.body ? JSON.parse(event.body || '{}') : {};
  body.action = 'create-store';
  return handleStoreRequest({
    httpMethod: event.httpMethod,
    headers: event.headers || {},
    queryStringParameters: { ...(event.queryStringParameters || {}), action: 'create-store' },
    body,
  });
};
