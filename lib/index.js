'use strict';
const routes = require('./routes');
const Registry = require('./registry');

module.exports.register = function register(server, options, next) {
  const registry = new Registry(options.resources);
  routes.register(server, registry);
  server.expose('registry', registry);
  server.expose('options', options);
  return next();
};

module.exports.register.attributes = {
  name: 'hapi-bookshelf-jsonapi',
  dependencies: ['bookshelf', '@gar/hapi-json-api', 'hapi-bookshelf-models'],
};
