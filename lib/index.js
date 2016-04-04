'use strict';
const errors = require('./errors');
const routes = require('./routes');

module.exports.register = function register(server, options, next) {
  errors.register(server, options.errors || function () { });
  routes.register(server, options.resources);
  return next();
};

module.exports.register.attributes = {
  name: 'hapi-bookshelf-jsonapi',
  dependencies: ['bookshelf'],
};
