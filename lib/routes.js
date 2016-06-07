'use strict';
const Boom = require('boom');
const Included = require('./included');
const Paginate = require('./paginate');

module.exports.register = function register(server, registry) {
  server.method('jsonapi.checkMissing', function checkMissing(model) {
    if (!model)
      throw Boom.notFound('Resource not found for that identifier');
    return model;
  });
  const checkMissing = server.methods.jsonapi.checkMissing;

  function catchErrors(handler) {
    return (function (request, reply) {
      try {
        return handler(request, reply);
      } catch(err) {
        return reply(Boom.wrap(err));
      }
    }).bind(this);
  }

  registry.forEach(function (resource) {
    const ResModel = server.plugins.bookshelf.model(resource.model);
    const tableName = (new ResModel()).tableName;
    const updatedCol = resource.specialCols.updated;
    const loaded = resource.getRelLoaded();

    function getConf(action, rel, relInfo) {
      const relationship = {name: rel};
      var readonly = resource.readonly;
      if (relInfo) {
        readonly = readonly || relInfo.readonly;
        Object.assign(relationship, relInfo);
      }
      return {
        isInternal: readonly && ['index', 'fetch'].indexOf(action) === -1,
        plugins: {
          'hapi-bookshelf-jsonapi': {
            resource: resource,
            action: action,
            relationship: relationship,
          },
        },
      };
    }

    server.method(`jsonapi.${resource.type}.serialize`,
    function serializeResource(model, included, request) {
      var query;
      if (request) query = resource.parseQuery(request);
      const serializer = resource.getSerializer(query);
      return {data: serializer.serialize(model, included)};
    });

    server.route({
      method: 'POST',
      path: resource.getPath(),
      config: Object.assign(getConf('create'), {
        validate: {payload: registry.schema.getCreateSchema(resource.type)},
      }),
      handler: catchErrors(function (request, reply) {
        const query = resource.parseQuery(request);
        const serializer = resource.getSerializer(query);
        const attrs = serializer.deserialize(request.payload);
        Promise.resolve(attrs)
          .then(attrs => new ResModel(attrs).save())
          .then(model => model.refresh())
          .then(function (model) {
            return reply({data: serializer.serialize(model)})
              .code(201).header('location', resource.getPath(model.id));
          })
          .catch(err => reply(err));
      }),
    });

    server.route({
      method: 'GET',
      path: resource.getPath(),
      config: getConf('index'),
      handler: catchErrors(function (request, reply) {
        const included = new Included();
        const paginate = new Paginate(request);
        const query = resource.parseQuery(request);
        const serializer = resource.getSerializer(query);
        ResModel.query(paginate.query).query(query.query).fetchAll(query.fetch)
          .then(function (collection) {
            return reply({
              data: collection.map(model => serializer.serialize(model, included)),
              links: paginate.getLinks(collection),
              included: included,
            });
          })
          .catch(err => reply(err));
      }),
    });

    server.route({
      method: 'GET',
      path: resource.getPath('{id}'),
      config: getConf('fetch'),
      handler: catchErrors(function (request, reply) {
        const included = new Included();
        const query = resource.parseQuery(request);
        const serializer = resource.getSerializer(query);
        ResModel.where(`${tableName}.id`, request.params.id).query(query.query).fetch(query.fetch)
          .then(checkMissing)
          .then(function (model) {
            return reply({
              data: serializer.serialize(model, included),
              included: included,
            });
          })
          .catch(err => reply(err));
      }),
    });

    server.route({
      method: 'PATCH',
      path: resource.getPath('{id}'),
      config: Object.assign(getConf('update'), {
        validate: {payload: registry.schema.getUpdateSchema(resource.type)},
      }),
      handler: catchErrors(function (request, reply) {
        const query = resource.parseQuery(request);
        const serializer = resource.getSerializer(query);
        const attrs = serializer.deserialize(request.payload)
        Promise.resolve(attrs)
          .then(function (attrs) {
            if (updatedCol)
              attrs[updatedCol] = server.plugins.bookshelf.knex.fn.now();
            const model = new ResModel({id: request.params.id});
            if (Object.keys(attrs).length === 0) return model;
            else return model.save(attrs, {patch: true})
          })
          .then(checkMissing)
          .then(model => model.refresh(query.fetch))
          .then(function (model) {
            return reply({data: serializer.serialize(model)});
          })
          .catch(err => reply(err));
      }),
    });

    server.route({
      method: 'DELETE',
      path: resource.getPath('{id}'),
      config: getConf('delete'),
      handler: catchErrors(function (request, reply) {
        ResModel.where(`${tableName}.id`, request.params.id).destroy()
          .then(function () {
            return reply().code(204);
          })
          .catch(err => reply(err));
      }),
    });

    resource.forEachRelOne(function (rel, relInfo) {
      server.route({
        method: 'GET',
        path: resource.getPath('{id}', rel),
        config: getConf('fetch', rel, relInfo),
        handler: catchErrors(function (request, reply) {
          const query = resource.parseQuery(request);
          const serializer = resource.getSerializer(query);
          ResModel.where(`${tableName}.id`, request.params.id)
            .query(query.query).fetch(query.fetch)
            .then(checkMissing)
            .then(function (model) {
              return reply(serializer.serializeRelOne(model, rel));
            })
            .catch(err => reply(err));
        }),
      });

      server.route({
        method: 'PATCH',
        path: resource.getPath('{id}', rel),
        config: Object.assign(getConf('update', rel, relInfo), {
          validate: {payload: registry.schema.getHasOneSchema()},
        }),
        handler: catchErrors(function (request, reply) {
          const query = resource.parseQuery(request);
          const serializer = resource.getSerializer(query);
          const attrs = serializer.deserializeRelOne(request.payload, rel);
          Promise.resolve(attrs)
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
        }),
      });
    });

    resource.forEachRelMany(function (rel, relInfo) {
      server.route({
        method: 'GET',
        path: resource.getPath('{id}')+`/${rel}`,
        config: getConf('index', rel, relInfo),
        handler: catchErrors(function (request, reply) {
          const included = new Included();
          const paginate = new Paginate(request);
          const query = relInfo.resource.parseQuery(request);
          const serializer = relInfo.resource.getSerializer(query);
          ResModel.where(`${tableName}.id`, request.params.id)
            .fetch({withRelated: {[rel]: qb => {
              query.query(qb);
              paginate.query(qb);
            }}})
            .then(checkMissing)
            .then(function (model) {
              const collection = model.related(rel);
              return collection.load(query.fetch.withRelated);
            })
            .then(function (collection) {
              return reply({
                data: collection.map(model => serializer.serialize(model, included)),
                links: paginate.getLinks(collection),
                included: included,
              });
            })
            .catch(err => reply(err));
        }),
      });

      server.route({
        method: 'GET',
        path: resource.getPath('{id}', rel),
        config: getConf('fetch', rel, relInfo),
        handler: catchErrors(function (request, reply) {
          const paginate = new Paginate(request);
          const serializer = resource.getSerializer();
          ResModel.where(`${tableName}.id`, request.params.id)
            .fetch({withRelated: {[rel]: qb => {
              paginate.query(qb);
              qb.select('id');
            }}})
            .then(checkMissing)
            .then(function (model) {
              const collection = model.related(rel);
              return reply(serializer.serializeRelMany(model, rel, collection, paginate));
            })
            .catch(err => reply(err));
        }),
      });

      server.route({
        method: 'POST',
        path: resource.getPath('{id}', rel),
        config: Object.assign(getConf('update', rel, relInfo), {
          validate: {payload: registry.schema.getHasManySchema()},
        }),
        handler: catchErrors(function (request, reply) {
          const serializer = resource.getSerializer();
          ResModel.where(`${tableName}.id`, request.params.id).fetch()
            .then(checkMissing)
            .then(function (model) {
              const add = serializer.deserializeRelMany(request.payload, rel);
              return model.related(rel).attach(add).then(() => model);
            })
            .then(function (model) {
              return reply(serializer.serializeRelMany(model, rel));
            })
            .catch(err => reply(err));
        }),
      });

      server.route({
        method: 'PATCH',
        path: resource.getPath('{id}', rel),
        config: Object.assign(getConf('update', rel, relInfo), {
          validate: {payload: registry.schema.getHasManySchema()},
        }),
        handler: catchErrors(function (request, reply) {
          const serializer = resource.getSerializer();
          ResModel.where(`${tableName}.id`, request.params.id).fetch()
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
        }),
      });

      server.route({
        method: 'DELETE',
        path: resource.getPath('{id}', rel),
        config: getConf('update', rel, relInfo),
        handler: catchErrors(function (request, reply) {
          const serializer = resource.getSerializer();
          ResModel.where(`${tableName}.id`, request.params.id).fetch()
            .then(checkMissing)
            .then(function (model) {
              const remove = serializer.deserializeRelMany(request.payload, rel);
              return model.related(rel).detach(remove).then(() => model);
            })
            .then(function (model) {
              return reply(serializer.serializeRelMany(model, rel));
            })
            .catch(err => reply(err));
        }),
      });
    });
  });
};
