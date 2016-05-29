'use strict';
const Boom = require('boom');
const Joi = require('joi');

class Query {
  constructor(registry, resource, request) {
    this.registry = registry;
    this.resource = resource;
    Query._parseQuery(this, registry, request.query);

    this.meta = this.requestMeta(request);
    this.query = this.query.bind(this, request);
    this.trimFields = this.trimFields.bind(this);
    this.isIncluded = this.isIncluded.bind(this);
  }

  static applyFilters(query, name) {
    const key = name ? `filter[${name}]` : 'filter';
    const filterRaw = query[key];
    if (!filterRaw) return function () { };
    const validation = Joi.validate(filterRaw, Query.validate.filter);
    if (validation.error) throw Boom.badRequest(`Bad filter string: ${filterRaw}`);
    return function (qb) {
      validation.value.forEach(function (f) { qb.where.apply(qb, f); });
    };
  }

  static _parseQuery(obj, registry, query) {
    const resource = obj.resource;
    const includedRels = query.include ? query.include.split(',') : [];
    const sortFields = query.sort ? query.sort.split(',') : [];
    const withRelated = {};
    obj.filter = Query.applyFilters(query);
    obj.included = includedRels.reduce(function (val, rel) {
      val[rel] = true;
      withRelated[rel] = Query.applyFilters(query, rel);
      return val;
    }, {});
    obj.fields = Object.keys(registry.resources).reduce(function (val, type) {
      const fieldsRaw = query[`fields[${type}]`];
      if (fieldsRaw) val[type] = fieldsRaw.split(',');
      return val;
    }, {});
    obj.sort = sortFields.map(function (field) {
      if (field.split('.').length > 1)
        throw Boom.badRequest(`Cannot sort on relationships: ${field}`);
      const ret = {field: field, dir: 'asc'};
      if (field.startsWith('-')) {
        ret.field = field.slice(1);
        ret.dir = 'desc';
      }
      return ret;
    });
    obj.fetch = {withRelated: withRelated};
  }

  _getServerMethod(request, methodType) {
    const methods = request.server.methods;
    const route = request.route.settings.plugins['hapi-bookshelf-jsonapi'];
    var method;
    try {
      return methods.jsonapi[route.resource.type][methodType][route.action];
    } catch(err) {
      return;
    }
  }

  requestMeta(request) {
    const method = this._getServerMethod(request, 'meta');
    return method ? method(request) : [];
  }

  requestQuery(qb, request) {
    const method = this._getServerMethod(request, 'query');
    if (method) return method(qb, request);
  }

  query(request, qb) {
    this.filter(qb);
    this.requestQuery(qb, request);
    this.resource.query(qb, request);
    this.sort.forEach(function (sort) { qb.orderBy(sort.field, sort.dir); });
    return qb;
  }

  _trimFields(fields, from) {
    return Object.keys(from).reduce(function (val, key) {
      if (fields.indexOf(key) !== -1) val[key] = from[key];
      return val;
    }, {});
  }

  trimFields(resource, data) {
    const fields = this.fields[resource.type];
    if (!fields) return data;
    else return Object.assign(data, {
      attributes: this._trimFields(fields, data.attributes),
      relationships: this._trimFields(fields, data.relationships),
    }, data.meta ? {meta: this._trimFields(fields, data.meta)} : undefined);
  }

  isIncluded(rel, stack) {
    if (stack) rel = stack.concat([rel]).join('.');
    return this.included[rel];
  }
}

Query.validate = {
  filter: Joi.array().sparse(false).single().items([
    Joi.array().min(2).max(3).ordered(Joi.string()).items([
      Joi.string(), Joi.number(), Joi.boolean(), Joi.date(),
    ]),
    Joi.array().single().length(1).items([
      Joi.object().min(1).pattern(/.*/, [
        Joi.string(), Joi.number(), Joi.boolean(), Joi.date(),
      ]),
    ]),
  ]),
};

module.exports = Query;
