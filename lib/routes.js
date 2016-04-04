'use strict';
const Paginate = require('./paginate').Paginate;
const jsonapi = require('./jsonapi');

module.exports.register = function register(server, resources) {
  resources.forEach(function (resource) {
    const modelName = resource.modelName;
    const basePath = resource.basePath;
    const MyModel = server.plugins.bookshelf.model(modelName);
    const relations = Object.keys(MyModel.jsonapi.relationships);
    const paginate = new Paginate(MyModel, basePath);
    const errors = server.methods.jsonapi.errors;

    server.route({
      method: 'POST',
      path: basePath,
      handler: function (request, reply) {
        jsonapi.deserialize(MyModel, request.payload.data)
          .then(function (attrs) {
            return new MyModel(attrs).save();
          })
          .then(function (model) {
            return reply({data: jsonapi.serialize(model)})
              .code(201).header('location', `${basePath}/${model.id}`);
          })
          .catch(function (err) {
            return errors.handle(err, request, reply);
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
            return errors.handle(err, request, reply);
          });
      }
    });

    server.route({
      method: 'GET',
      path: `${basePath}/{id}`,
      handler: function (request, reply) {
        MyModel.where('id', request.params.id).fetch()
          .then(errors.checkMissing)
          .then(function (model) {
            return reply({data: jsonapi.serialize(model)});
          })
          .catch(function (err) {
            return errors.handle(err, request, reply);
          });
      }
    });

    server.route({
      method: 'PATCH',
      path: `${basePath}/{id}`,
      handler: function (request, reply) {
        jsonapi.deserialize(MyModel, request.payload.data)
          .then(function (attrs) {
            return new MyModel({id: request.params.id}).save(attrs, {patch: true})
          })
          .then(errors.checkMissing)
          .then(model => model.refresh())
          .then(function (model) {
            return reply({data: jsonapi.serialize(model)}).code(200);
          })
          .catch(function (err) {
            return errors.handle(err, request, reply);
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
            return errors.handle(err, request, reply);
          });
      },
    });

    relations.forEach(function (rel) {
      server.route({
        method: 'GET',
        path: `/${basepath}/{id}/relationships/${rel}`,
        handler: function (request, reply) {
          MyModel.where('id', request.params.id).fetch({withRelated: rel})
            .then(errors.checkMissing)
            .then(function (model) {
              return model.related(rel);
            })
            .then(errors.checkMissing)
            .then(function (model) {
              return reply({data: jsonapi.serialize(model)});
            })
            .catch(function (err) {
              return errors.handle(err, request, reply);
            });
          },
      });

      server.route({
        method: 'PATCH',
        path: `/${basepath}/{id}/relationships/${rel}`,
        handler: function (request, reply) {
          jsonapi.deserializeRel(MyModel, rel, request.payload.data)
            .then(function (attrs) {
              return new MyModel({id: request.params.id}).save(attrs, {patch: true});
            })
            .then(errors.checkMissing)
            .then(function (model) {
              return model.refresh({withRelated: rel});
            })
            .then(model => model.related(rel))
            .then(errors.checkMissing)
            .then(function (model) {
              return reply({data: jsonapi.serialize(model)}).code(200);
            })
            .catch(function (err) {
              return errors.handle(err, request, reply);
            });
        },
      });
    });
  });
};
