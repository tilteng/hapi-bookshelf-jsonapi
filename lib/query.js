'use strict';
const Boom = require('boom');

class Query {
  constructor(registry, resource, query) {
    this.registry = registry;
    this.resource = resource;
    Query._parseQuery(this, registry, query);

    this.query = this.query.bind(this);
    this.trimFields = this.trimFields.bind(this);
    this.isIncluded = this.isIncluded.bind(this);
  }

  static applyFilters(query, name, first) {
    const key = name ? `filter[${name}]` : 'filter';
    const filter = query[key] || '[]';
    return function (qb) {
      if (first) first(qb);
      try {
        JSON.parse(filter).forEach(function (f) { qb.where.apply(qb, f) });
      } catch(err) {
        throw Boom.badRequest(`Bad filter string: ${query[key]}`);
      }
    };
  }

  static _parseQuery(obj, registry, query) {
    const resource = obj.resource;
    const includedRels = query.include ? query.include.split(',') : [];
    const metaFields = query.meta ? query.meta.split(',') : [];
    const sortFields = query.sort ? query.sort.split(',') : [];
    const withRelated = {};
    obj.filter = Query.applyFilters(query);
    obj.meta = metaFields.map(function (name) {
      const field = resource.specialCols.optional[name];
      if (!field) throw Boom.badRequest(`Unknown meta field: ${name}`);
      return Query.applyFilters(query, name, field);
    });
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

  query(qb) {
    this.filter(qb);
    this.meta.forEach(function (meta) { meta(qb); });
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

module.exports = Query;
