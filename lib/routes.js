'use strict';
const Boom = require('boom');
const Paginate = require('./paginate').Paginate;
const JSONAPISerializer = require('./jsonapi').JSONAPISerializer;

module.exports.register = function register(server, registry) {
  server.method('jsonapi.checkMissing', function checkMissing(model) {
    if (!model)
      throw new Boom.notFound('Resource not found for that identifier');
    return model;
  });
  const checkMissing = server.methods.jsonapi.checkMissing;

  registry.forEach(function (resource) {
    const serializer = new JSONAPISerializer(resource);
    const ResModel = server.plugins.bookshelf.model(resource.model);

    server.route({
      method: 'POST',
      path: resource.getPath(),
      handler: function (request, reply) {
        Promise.resolve(request.payload.data)
          .then(function (data) {
            return serializer.deserialize(data);
          })
          .then(function (attrs) {
            return new ResModel(attrs).save();
          })
          .then(function (model) {
            return reply({data: serializer.serialize(model)})
              .code(201).header('location', resource.getPath(model.id));
          })
          .catch(err => reply(err));
      }
    });

    server.route({
      method: 'GET',
      path: resource.getPath(),
      handler: function (request, reply) {
        const paginate = new Paginate(request);
        ResModel.query(paginate.query).fetchAll()
          .then(function (collection) {
            return reply({
              data: collection.map(model => serializer.serialize(model)),
              links: paginate.getLinks(collection)
            });
          })
          .catch(err => reply(err));
      }
    });

    server.route({
      method: 'GET',
      path: resource.getPath('{id}'),
      handler: function (request, reply) {
        ResModel.where('id', request.params.id).fetch()
          .then(checkMissing)
          .then(function (model) {
            return reply({data: serializer.serialize(model)});
          })
          .catch(err => reply(err));
      }
    });

    server.route({
      method: 'PATCH',
      path: resource.getPath('{id}'),
      handler: function (request, reply) {
        Promise.resolve(request.payload.data)
          .then(function (data) {
            return serializer.deserialize(data);
          })
          .then(function (attrs) {
            return new ResModel({id: request.params.id}).save(attrs, {patch: true})
          })
          .then(checkMissing)
          .then(model => model.refresh())
          .then(function (model) {
            return reply({data: serializer.serialize(model)}).code(200);
          })
          .catch(err => reply(err));
      },
    });

    server.route({
      method: 'DELETE',
      path: resource.getPath('{id}'),
      handler: function (request, reply) {
        ResModel.where('id', request.params.id).destroy()
          .then(function () {
            return reply().code(204);
          })
          .catch(err => reply(err));
      },
    });

    resource.forEachRelOne(function (rel) {
      server.route({
        method: 'GET',
        path: resource.getPath('{id}', rel),
        handler: function (request, reply) {
          ResModel.where('id', request.params.id).fetch()
            .then(checkMissing)
            .then(function (model) {
              return reply(serializer.serializeRelOne(model, rel));
            })
            .catch(err => reply(err));
        },
      });

      server.route({
        method: 'PATCH',
        path: resource.getPath('{id}', rel),
        handler: function (request, reply) {
          Promise.resolve(request.payload.data)
            .then(function (data) {
              return serializer.deserializeRelOne(data, rel);
            })
            .then(function (attrs) {
              return new ResModel({id: request.params.id}).save(attrs, {patch: true});
            })
            .then(checkMissing)
            .then(function (model) {
              return reply(serializer.serializeRelOne(model, rel));
            })
            .catch(err => reply(err));
        },
      });
    });

    resource.forEachRelMany(function (rel, relInfo) {
      server.route({
        method: 'GET',
        path: resource.getPath('{id}')+`/${rel}`,
        handler: function (request, reply) {
          const paginate = new Paginate(request);
          ResModel.where('id', request.params.id)
            .fetch({withRelated: {[rel]: paginate.query}})
            .then(checkMissing)
            .then(function (model) {
              const collection = model.related(rel);
              const serializer = relInfo.resource.serializer;
              return reply({
                data: collection.map(model => serializer.serialize(model)),
                links: paginate.getLinks(collection)
              });
            })
            .catch(err => reply(err));
        },
      });

      server.route({
        method: 'GET',
        path: resource.getPath('{id}', rel),
        handler: function (request, reply) {
          const paginate = new Paginate(request);
          ResModel.where('id', request.params.id)
            .fetch({withRelated: {[rel]: qb => paginate.query(qb).select('id')}})
            .then(checkMissing)
            .then(function (model) {
              const collection = model.related(rel);
              return reply(serializer.serializeRelMany(model, rel, collection, paginate));
            })
            .catch(err => reply(err));
        },
      });

      server.route({
        method: 'POST',
        path: resource.getPath('{id}', rel),
        handler: function (request, reply) {
          if (relInfo.readonly)
            return reply(Boom.unauthorized('This relationship is read-only'));
          ResModel.where('id', request.params.id).fetch()
            .then(checkMissing)
            .then(function (model) {
              const add = serializer.deserializeRelMany(request.payload.data, rel);
              return model.related(rel).attach(add).then(() => model);
            })
            .then(function (model) {
              return reply(serializer.serializeRelMany(model, rel));
            })
            .catch(err => reply(err));
        },
      });

      server.route({
        method: 'PATCH',
        path: resource.getPath('{id}', rel),
        handler: function (request, reply) {
          if (relInfo.readonly)
            return reply(Boom.unauthorized('This relationship is read-only'));
          ResModel.where('id', request.params.id).fetch()
            .then(checkMissing)
            .then(function (model) {
              const replace = serializer.deserializeRelMany(request.payload.data, rel);
              return server.plugins.bookshelf.transaction(function (t) {
                return model.related(rel).detach(null, {transacting: t})
                  .then(function () {
                    return model.related(rel).attach(replace, {transacting: t});
                  })
                  .then(() => model);
              });
            })
            .then(function (model) {
              return reply(serializer.serializeRelMany(model, rel));
            })
            .catch(err => reply(err));
        },
      });

      server.route({
        method: 'DELETE',
        path: resource.getPath('{id}', rel),
        handler: function (request, reply) {
          if (relInfo.readonly)
            return reply(Boom.unauthorized('This relationship is read-only'));
          ResModel.where('id', request.params.id).fetch()
            .then(checkMissing)
            .then(function (model) {
              const remove = serializer.deserializeRelMany(request.payload.data, rel);
              return model.related(rel).detach(remove).then(() => model);
            })
            .then(function (model) {
              return reply(serializer.serializeRelMany(model, rel));
            })
            .catch(err => reply(err));
        },
      });
    });
  });
};
