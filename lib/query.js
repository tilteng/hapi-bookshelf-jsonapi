'use strict';
const Boom = require('boom');
const Joi = require('joi');

class Query {
  constructor(registry, resource, request) {
    this.registry = registry;
    this.resource = resource;
    this.request = request;
    this.server = request.server;
    this.action = request.route.settings.plugins['hapi-bookshelf-jsonapi'].action;

    this._parseQuery(registry);

    this.query = this.query.bind(this);
    this.getMeta = this.requestMeta.bind(this);
    this.trimFields = this.trimFields.bind(this);
    this.isIncluded = this.isIncluded.bind(this);
  }

  _applyFilters(query, rel, relInfo) {
    const key = rel ? `filter[${rel}]` : 'filter';
    const filterRaw = query[key];
    var validation;
    if (filterRaw) {
      validation = Joi.validate(filterRaw, Query.validate.filter);
      if (validation.error) throw Boom.badRequest(`Bad filter string: ${filterRaw}`);
    }
    return (function (qb) {
      if (validation)
        validation.value.forEach(function (f) { qb.where.apply(qb, f); });
    }).bind(this);
  }

  _parseQuery(registry) {
    const resource = this.resource;
    const query = this.request.query;
    const includedRels = query.include ? query.include.split(',') : [];
    const sortFields = query.sort ? query.sort.split(',') : [];
    const withRelated = {};
    this.filter = this._applyFilters(query);
    this.included = includedRels.reduce((function (val, rel) {
      const relInfo = resource.getRelOne(rel) || resource.getRelMany(rel);
      val[rel] = true;
      withRelated[rel] = this._applyFilters(query, rel, relInfo);
      return val;
    }).bind(this), {});
    this.fields = Object.keys(registry.resources).reduce(function (val, type) {
      const fieldsRaw = query[`fields[${type}]`];
      if (fieldsRaw) val[type] = fieldsRaw.split(',');
      return val;
    }, {});
    this.sort = sortFields.map(function (field) {
      if (field.split('.').length > 1)
        throw Boom.badRequest(`Cannot sort on relationships: ${field}`);
      const ret = {field: field, dir: 'asc'};
      if (field.startsWith('-')) {
        ret.field = field.slice(1);
        ret.dir = 'desc';
      }
      return ret;
    });
    this.fetch = {withRelated: withRelated};
  }

  _getServerMethod(resource, methodType) {
    const methods = this.server.methods;
    try {
      return methods.jsonapi[resource.type][methodType][this.action];
    } catch(err) {
      return;
    }
  }

  requestMeta(resource) {
    const method = this._getServerMethod(resource, 'meta');
    return method ? method(this.request) : [];
  }

  requestQuery(qb, resource) {
    const method = this._getServerMethod(resource, 'query');
    const Model = this.server.plugins.bookshelf.model(resource.model);
    if (method) return method(qb, this.request, Model);
  }

  query(qb) {
    this.filter(qb);
    this.requestQuery(qb, this.resource);
    this.resource.query(qb, this.request);
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
