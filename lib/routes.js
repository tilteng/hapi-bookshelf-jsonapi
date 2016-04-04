'use strict';
const Paginate = require('./paginate').Paginate;

module.exports.register = function register(server, resources) {
  resources.forEach(function (resource) {
    const modelName = resource.modelName;
    const basePath = resource.basePath;
    const MyModel = server.plugins.bookshelf.model(modelName);
    const hasOne = Object.keys(MyModel.jsonapi.hasOne || {});
    const hasMany = Object.keys(MyModel.jsonapi.hasMany || {});
    const paginate = new Paginate(MyModel, basePath);
    const jsonapi = server.methods.jsonapi;

    server.route({
      method: 'POST',
      path: basePath,
      handler: function (request, reply) {
        Promise.resolve(request.payload.data)
          .then(function (data) {
            return jsonapi.deserialize(MyModel, data);
          })
          .then(function (attrs) {
            return new MyModel(attrs).save();
          })
          .then(function (model) {
            return reply({data: jsonapi.serialize(model)})
              .code(201).header('location', `${basePath}/${model.id}`);
          })
          .catch(function (err) {
            return jsonapi.errors.handle(err, request, reply);
          });
      }
    });

    server.route({
      method: 'GET',
      path: basePath,
      handler: function (request, reply) {
        paginate.query(request.query).fetchAll()
          .then(function (collection) {
            return reply({
              data: collection.map(model => jsonapi.serialize(model)),
              links: paginate.getLinks(request.query, collection)
            });
          })
          .catch(function (err) {
            return jsonapi.errors.handle(err, request, reply);
          });
      }
    });

    server.route({
      method: 'GET',
      path: `${basePath}/{id}`,
      handler: function (request, reply) {
        MyModel.where('id', request.params.id).fetch()
          .then(jsonapi.errors.checkMissing)
          .then(function (model) {
            return reply({data: jsonapi.serialize(model)});
          })
          .catch(function (err) {
            return jsonapi.errors.handle(err, request, reply);
          });
      }
    });

    server.route({
      method: 'PATCH',
      path: `${basePath}/{id}`,
      handler: function (request, reply) {
        Promise.resolve(request.payload.data)
          .then(function (data) {
            return jsonapi.deserialize(MyModel, data);
          })
          .then(function (attrs) {
            return new MyModel({id: request.params.id}).save(attrs, {patch: true})
          })
          .then(jsonapi.errors.checkMissing)
          .then(model => model.refresh())
          .then(function (model) {
            return reply({data: jsonapi.serialize(model)}).code(200);
          })
          .catch(function (err) {
            return jsonapi.errors.handle(err, request, reply);
          });
      }
    });

    server.route({
      method: 'DELETE',
      path: `${basePath}/{id}`,
      handler: function (request, reply) {
        MyModel.where('id', request.params.id).destroy()
          .then(function () {
            return reply().code(204);
          })
          .catch(function (err) {
            return jsonapi.errors.handle(err, request, reply);
          });
      },
    });

    hasOne.forEach(function (rel) {
      server.route({
        method: 'GET',
        path: `${basePath}/{id}/relationships/${rel}`,
        handler: function (request, reply) {
          MyModel.where('id', request.params.id).fetch({withRelated: rel})
            .then(jsonapi.errors.checkMissing)
            .then(function (model) {
              return model.related(rel);
            })
            .then(jsonapi.errors.checkMissing)
            .then(function (model) {
              return reply({data: jsonapi.serialize(model)});
            })
            .catch(function (err) {
              return jsonapi.errors.handle(err, request, reply);
            });
          },
      });

      server.route({
        method: 'PATCH',
        path: `${basePath}/{id}/relationships/${rel}`,
        handler: function (request, reply) {
          Promise.resolve(request.payload.data)
            .then(function (data) {
              return jsonapi.deserializeRel(MyModel, rel, data);
            })
            .then(function (attrs) {
              return new MyModel({id: request.params.id}).save(attrs, {patch: true});
            })
            .then(jsonapi.errors.checkMissing)
            .then(function (model) {
              return model.refresh({withRelated: rel});
            })
            .then(model => model.related(rel))
            .then(jsonapi.errors.checkMissing)
            .then(function (model) {
              return reply({data: jsonapi.serialize(model)}).code(200);
            })
            .catch(function (err) {
              return jsonapi.errors.handle(err, request, reply);
            });
        },
      });
    });
  });
};
