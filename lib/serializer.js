'use strict';
const Boom = require('boom');

class Serializer {
  constructor(resource, query, stack) {
    this.resource = resource;
    this.query = query;
    this.stack = stack || [];
    this.metaCols = [].concat(
      resource.specialCols.meta,
      query ? query.getMeta(resource) : []
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

  save(model, results, trx) {
    const attrs = results.attributes;
    const rels = results.relationships;
    const options = {transacting: trx};
    if (!model.isNew())
      options.patch = true;
    const numAttrs = Object.keys(attrs).length;
    return (numAttrs ? model.save(attrs, options) : Promise.resolve(model))
      .then(model => {
        return Promise.all(Object.keys(rels).map(rel => {
          if (Array.isArray(rels[rel])) {
            return model.related(rel).detach(null, {transacting: trx})
              .then(() => this.saveRelMany(model, rel, rels[rel], trx));
          } else {
            return this.saveRelOne(model, rel, rels[rel], trx);
          }
        }));
      })
      .then(() => model);
  }

  saveRelOne(model, rel, relId, trx) {
    const foreignKey = model.related(rel).relatedData.foreignKey;
    return model.save(
      {[foreignKey]: relId},
      {transacting: trx, patch: true}
    );
  }

  saveRelMany(model, rel, relIds, trx) {
    return model.related(rel).attach(relIds, {transacting: trx});
  }

  deserialize(payload) {
    const data = payload.data;
    if (data.type !== this.resource.type)
      throw Boom.conflict(`Expected resource type ${this.resource.type}, got ${data.type}`);
    const attrs = Object.assign({}, data.attributes || {});
    const relData = data.relationships || {};
    const rels = {};
    this.metaCols.forEach(function (col) {
      if (attrs[col]) delete attrs[col];
    });
    this.resource.forEachRelOne(function (rel) {
      if (relData[rel]) {
        rels[rel] = this.deserializeRelOne(relData[rel], rel);
      }
    }, this);
    this.resource.forEachRelMany(function (rel) {
      if (relData[rel]) {
        rels[rel] = this.deserializeRelMany(relData[rel], rel);
      }
    }, this);
    return {attributes: attrs, relationships: rels};
  }


  deserializeRelOne(payload, rel) {
    const data = payload.data;
    const relOne = this.resource.getRelOne(rel);
    if (!relOne.column)
      throw Boom.forbidden(`Relationship ${rel} not allowed in this request`);
    if (!data)
      return null;
    if (data.type !== relOne.resource.type)
      throw Boom.conflict(`Expected resource type ${relOne.resource.type}, got ${data.type}`);
    return data.id;
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
