'use strict';

const Paginate = require('./paginate').Paginate;
const jsonapi = require('./jsonapi');

module.exports.register = function register(server, options, next) {
  const modelName = options.modelName;
  const basePath = options.basePath;
  const MyModel = server.plugins.bookshelf.model(modelName);
  const relations = Object.keys(MyModel.jsonapi.relationships);
  const paginate = new Paginate(MyModel, basePath);

  server.route({
    method: 'POST',
    path: basePath,
    handler: function (request, reply) {
      if(!request.payload.data){
        reply(500);
      }
      var attrs = jsonapi.deserialize(MyModel, request.payload.data);
      new MyModel(attrs).save()
        .then(function (model) {
          return reply({data: jsonapi.serialize(model)});
        })
        .catch(function (err) {
          console.error(err);
          throw err;
          reply(err);
        });
    }
  });

  server.route({
    method: 'GET',
    path: basePath,
    handler: function (request, reply) {
      paginate.query(request.query).fetchAll()
        .then(function (collection) {
          reply({
            data: collection.map(model => jsonapi.serialize(model)),
            links: paginate.getLinks(request.query, collection)
          });
        })
        .catch(function (err) {
          console.error(err);
          reply(err);
        });
    }
  });

  server.route({
    method: 'GET',
    path: basePath+'/{id}',
    handler: function (request, reply) {
      MyModel.where('id', request.params.id).fetch({require: true})
        .then(function (model) {
          return reply({data: jsonapi.serialize(model)});
        })
        .catch(function (err) {
          console.error(err);
          reply(err);
        });
    }
  });

  server.route({
    method: 'DELETE',
    path: basePath+'/{id}',
    handler: function (request, reply) {
      MyModel.where('id', request.params.id).destroy()
        .then(function () {
          reply().code(204);
        })
        .catch(function (err) {
          console.error(err);
          reply(err);
        });
    },
  });

  relations.forEach(function (rel) {
    server.route({
      method: 'GET',
      path: basePath+'/{id}/relationships/'+rel,
      handler: function (request, reply) {
        MyModel.where('id', request.params.id).fetch({require: true, withRelated: [rel]})
          .then(function (model) {
            return model.related(rel);
          })
          .then(function (model) {
            return reply({data: jsonapi.serialize(model)});
          })
          .catch(function (err) {
            console.error(err);
            reply(err);
          });
        },
    });
  });

  return next();
};

module.exports.register.attributes = {
  name: 'crud',
  multiple: true,
  dependencies: ['bookshelf'],
};
