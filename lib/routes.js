'use strict';
const Boom = require('boom');
const Paginate = require('./paginate').Paginate;
const JSONAPISerializer = require('./jsonapi').JSONAPISerializer;
const JSONAPISchema = require('./schema').JSONAPISchema;

module.exports.register = function register(server, registry) {
  server.method('jsonapi.checkMissing', function checkMissing(model) {
    if (!model)
      throw Boom.notFound('Resource not found for that identifier');
    return model;
  });
  const checkMissing = server.methods.jsonapi.checkMissing;
  const schema = new JSONAPISchema(registry);

  registry.forEach(function (resource) {
    const serializer = new JSONAPISerializer(resource);
    const ResModel = server.plugins.bookshelf.model(resource.model);
    const updatedCol = resource.specialCols.updated;

    function getConf(action, rel, relInfo) {
      const relationship = {name: rel};
      if (relInfo) Object.assign(relationship, relInfo);
      return {
        plugins: {
          'hapi-bookshelf-jsonapi': {
            resource: resource,
            action: action,
            relationship: relationship,
          },
        },
      };
    }

    server.route({
      method: 'POST',
      path: resource.getPath(),
      config: Object.assign(getConf('create'), {
        validate: {payload: schema.getCreateSchema(resource.type)},
      }),
      handler: function (request, reply) {
        Promise.resolve(request.payload)
          .then(function (payload) {
            return serializer.deserialize(payload);
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
      config: getConf('index'),
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
      config: getConf('fetch'),
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
      config: Object.assign(getConf('update'), {
        validate: {payload: schema.getUpdateSchema(resource.type)},
      }),
      handler: function (request, reply) {
        Promise.resolve(request.payload)
          .then(function (payload) {
            return serializer.deserialize(payload);
          })
          .then(function (attrs) {
            if (updatedCol)
              attrs[updatedCol] = server.plugins.bookshelf.knex.fn.now();
            const model = new ResModel({id: request.params.id});
            if (Object.keys(attrs).length === 0) return model;
            else return model.save(attrs, {patch: true})
          })
          .then(checkMissing)
          .then(model => model.refresh())
          .then(function (model) {
            return reply({data: serializer.serialize(model)});
          })
          .catch(err => reply(err));
      },
    });

    server.route({
      method: 'DELETE',
      path: resource.getPath('{id}'),
      config: getConf('delete'),
      handler: function (request, reply) {
        ResModel.where('id', request.params.id).destroy()
          .then(function () {
            return reply().code(204);
          })
          .catch(err => reply(err));
      },
    });

    resource.forEachRelOne(function (rel, relInfo) {
      server.route({
        method: 'GET',
        path: resource.getPath('{id}', rel),
        config: getConf('fetch', rel, relInfo),
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
        config: Object.assign(getConf('update', rel, relInfo), {
          validate: {payload: schema.getHasOneSchema()},
        }),
        handler: function (request, reply) {
          if (relInfo.readonly)
            return reply(Boom.unauthorized('This relationship is read-only'));
          Promise.resolve(request.payload)
            .then(function (payload) {
              return serializer.deserializeRelOne(payload, rel);
            })
            .then(function (attrs) {
              if (updatedCol)
                attrs[updatedCol] = server.plugins.bookshelf.knex.fn.now();
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
        config: getConf('index', rel, relInfo),
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
        config: getConf('fetch', rel, relInfo),
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
        config: Object.assign(getConf('update', rel, relInfo), {
          validate: {payload: schema.getHasManySchema()},
        }),
        handler: function (request, reply) {
          if (relInfo.readonly)
            return reply(Boom.unauthorized('This relationship is read-only'));
          ResModel.where('id', request.params.id).fetch()
            .then(checkMissing)
            .then(function (model) {
              const add = serializer.deserializeRelMany(payload, rel);
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
        config: Object.assign(getConf('update', rel, relInfo), {
          validate: {payload: schema.getHasManySchema()},
        }),
        handler: function (request, reply) {
          if (relInfo.readonly)
            return reply(Boom.unauthorized('This relationship is read-only'));
          ResModel.where('id', request.params.id).fetch()
            .then(checkMissing)
            .then(function (model) {
              const replace = serializer.deserializeRelMany(request.payload, rel);
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
        config: getConf('update', rel, relInfo),
        handler: function (request, reply) {
          if (relInfo.readonly)
            return reply(Boom.unauthorized('This relationship is read-only'));
          ResModel.where('id', request.params.id).fetch()
            .then(checkMissing)
            .then(function (model) {
              const remove = serializer.deserializeRelMany(request.payload, rel);
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
