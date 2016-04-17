'use strict';
const routes = require('./routes');
const JSONAPIRegistry = require('./jsonapi').JSONAPIRegistry;

module.exports.register = function register(server, options, next) {
  const registry = new JSONAPIRegistry(options.resources);
  routes.register(server, registry);
  server.expose('registry', registry);
  return next();
};

module.exports.register.attributes = {
  name: 'hapi-bookshelf-jsonapi',
  dependencies: ['bookshelf', '@gar/hapi-json-api'],
};
