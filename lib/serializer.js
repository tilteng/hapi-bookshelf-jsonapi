'use strict';
const Boom = require('boom');

class Serializer {
  constructor(resource, query, stack) {
    this.resource = resource;
    this.query = query;
    this.stack = stack || [];
    this.metaCols = [].concat(
      Object.keys(resource.specialCols.optional),
      resource.specialCols.meta
    );
    this.hideCols = resource.specialCols.hidden;
  }

  _trimFields(data) {
    if (this.query) return this.query.trimFields(this.resource, data);
    else return data;
  }

  serializeRelOne(model, rel, included) {
    const relInfo = this.resource.getRelOne(rel);
    const links = {self: this.resource.getPath(model.id, rel)};
    const relModel = model.related(rel);
    var relId = null, data = null;
    if (relInfo.column)
      relId = model.get(relInfo.column);
    else if (relModel)
      relId = relModel.id;
    if (relId) {
      links.related = relInfo.resource.getPath(relId);
      data = {
        type: relInfo.resource.type,
        id: `${relId}`,
      };
    }
    if (included && relModel && relId && this.query.isIncluded(rel, this.stack)) {
      const relSerializer = relInfo.resource.getSerializer(this.query, this.stack.concat([rel]));
      const relSerialized = relSerializer.serialize(relModel, included);
      included.push(relSerialized);
    }
    return {data: data, links: links};
  }

  serializeRelMany(model, rel, collection, paginate, included) {
    const relInfo = this.resource.getRelMany(rel);
    const ret = {
      links: {
        self: this.resource.getPath(model.id, rel),
        related: this.resource.getPath(model.id)+`/${rel}`,
      },
    };
    if (!collection && included && this.query.isIncluded(rel, this.stack))
      collection = model.related(rel);
    if (collection) {
      ret.data = collection.map(function (relModel) {
        if (included && this.query.isIncluded(rel, this.stack)) {
          const relSerializer = relInfo.resource.getSerializer(this.query, this.stack.concat([rel]));
          const relSerialized = relSerializer.serialize(relModel, included);
          included.push(relSerialized);
        }
        return {
          type: relInfo.resource.type,
          id: `${relModel.id}`,
        };
      }, this);
      if (paginate)
        Object.assign(ret.links, paginate.getLinks(collection));
    }
    return ret;
  }

  serialize(model, included) {
    const attrs = model.serialize({shallow: true});
    const rels = {};
    var meta;
    delete attrs.id;
    this.metaCols.forEach(function (col) {
      meta = meta || {};
      if (typeof attrs[col] !== 'undefined') {
        meta[col] = attrs[col];
        delete attrs[col];
      }
    });
    this.hideCols.forEach(function (col) {
      delete attrs[col];
    });
    this.resource.forEachRelOne(function (rel, relInfo) {
      if (relInfo.column) delete attrs[relInfo.column];
      rels[rel] = this.serializeRelOne(model, rel, included);
    }, this);
    this.resource.forEachRelMany(function (rel) {
      rels[rel] = this.serializeRelMany(model, rel, null, null, included);
    }, this);
    return this._trimFields({
      type: this.resource.type,
      id: `${model.id}`,
      attributes: attrs,
      relationships: rels,
      meta: meta,
    });
  }

  deserialize(payload) {
    const data = payload.data;
    if (data.type !== this.resource.type)
      throw Boom.conflict(`Expected resource type ${this.resource.type}, got ${data.type}`);
    const attrs = Object.assign({}, data.attributes || {});
    const rels = data.relationships || {};
    this.metaCols.forEach(function (col) {
      if (attrs[col]) delete attrs[col];
    });
    this.resource.forEachRelOne(function (rel, relInfo) {
      if (rels[rel]) {
        Object.assign(attrs, this.deserializeRelOne(rels[rel], rel));
      }
    }, this);
    return attrs;
  }

  deserializeRelOne(payload, rel) {
    const data = payload.data;
    const relOne = this.resource.getRelOne(rel);
    if (!relOne.column)
      throw Boom.forbidden(`Relationship ${rel} not allowed in this request`);
    if (!data)
      return {[relOne.column]: null};
    if (data.type !== relOne.resource.type)
      throw Boom.conflict(`Expected resource type ${relOne.resource.type}, got ${data.type}`);
    return {[relOne.column]: data.id};
  }

  deserializeRelMany(payload, rel) {
    const data = payload.data;
    const relMany = this.resource.getRelMany(rel);
    if (!data) return [];
    return data.map(function (item) {
      if (item.type !== relMany.resource.type)
        throw Boom.conflict(`Expected resource type ${relMany.resource.type}, got ${data.type}`);
      return item.id;
    });
  }
}

module.exports = Serializer;
