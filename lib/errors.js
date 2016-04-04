'use strict';

function InvalidTypeError(got, expected) {
  this.name = 'InvalidTypeError';
  this.message = 'Unexpected resource type';
  this.detail = `Expected ${expected}, got ${got}`;
}
InvalidTypeError.prototype = Object.create(Error.prototype);
InvalidTypeError.prototype.constructor = InvalidTypeError;

function NotFoundError(message) {
  this.name = 'NotFoundError';
  this.message = message || 'Resource Not Found';
}
NotFoundError.prototype = Object.create(Error.prototype);
NotFoundError.prototype.constructor = NotFoundError;

function checkMissing(model) {
  if (!model) throw new NotFoundError();
  return model;
}

function handleError(err, request, reply) {
  var handleCustom = this.methods.jsonapi.errors.handleCustom;
  var ret = handleCustom(err, request, reply) || {};
  return Promise.resolve(ret).then(function (errObj) {
    if (request.response) return;
    errObj.errors = errObj.errors || [{
      code: err.code || err.name,
      title: err.title || err.message || err.toString(),
      detail: err.detail,
      meta: err,
    }];
    if (!errObj.code) {
      errObj.code = 500;
      if (err.name === 'NotFoundError') {
        errObj.code = 404;
	    }
    }
    reply({errors: errObj.errors}).code(errObj.code);
  });
}

module.exports.InvalidTypeError = InvalidTypeError;
module.exports.NotFoundError = NotFoundError;
module.exports.checkMissing = checkMissing;
module.exports.handleError = handleError;

module.exports.register = function register(server, handleCustom) {
  server.method('jsonapi.errors.checkMissing', checkMissing, {bind: server});
  server.method('jsonapi.errors.handle', handleError, {bind: server});
  server.method('jsonapi.errors.handleCustom', handleCustom, {bind: server});

  server.route({
    method: '*',
    path: '/{p*}',
    handler: function badURLHandler(request, reply) {
      const err = new NotFoundError('URI Not Found');
      return handleError.call(server, err, request, reply);
    },
  });
};
