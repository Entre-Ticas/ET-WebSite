const { handleStoreRequest } = require('./store-catalog-shared');

exports.handler = async (event) => {
  const body = event.body ? JSON.parse(event.body || '{}') : {};
  return handleStoreRequest({
    httpMethod: event.httpMethod,
    headers: event.headers || {},
    queryStringParameters: event.queryStringParameters || {},
    body,
  });
};
