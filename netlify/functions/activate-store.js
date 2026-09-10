const { handleStoreRequest } = require('./store-catalog-shared');

exports.handler = async (event) => {
  const body = event.body ? JSON.parse(event.body || '{}') : {};
  body.action = 'activate-store';
  return handleStoreRequest({
    httpMethod: event.httpMethod,
    headers: event.headers || {},
    queryStringParameters: { ...(event.queryStringParameters || {}), action: 'activate-store' },
    body,
  });
};
