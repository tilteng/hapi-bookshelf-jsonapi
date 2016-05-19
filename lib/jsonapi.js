'use strict';
const Boom = require('boom');

class JSONAPIResource {
  constructor(type, info, registry) {
    this.type = type;
    this.model = info.model;
    this.hasOne = info.relationships.hasOne || {};
    this.hasMany = info.relationships.hasMany || {};
    this.basePath = info.basePath || `/${type.toLowerCase()}s`;
    this.readonly = info.readonly;
    this.schema = info.schema;
    this.specialCols = info.specialColumns || {};
    this.registry = registry;
    this.serializer = new JSONAPISerializer(this);
  }

  forEachRelOne(cb, self) {
    Object.keys(this.hasOne).forEach(function (key) {
      cb.call(self || this, key, this.getRelOne(key));
    }, this);
  }

  forEachRelMany(cb, self) {
    Object.keys(this.hasMany).forEach(function (key) {
      cb.call(self || this, key, this.getRelMany(key));
    }, this);
  }

  getRelLoaded() {
    const ret = [];
    this.forEachRelOne(function (rel, relInfo) {
      if (relInfo.included || !relInfo.column) ret.push(rel);
    });
    this.forEachRelMany(function (rel, relInfo) {
      if (relInfo.included) ret.push(rel);
    });
    return ret;
  }

  getRelOne(rel, expected) {
    const relOne = this.hasOne[rel];
    if (relOne) {
      return Object.assign({
        resource: this.registry.getRes(relOne.type, expected),
      }, relOne);
    }
  }

  getRelMany(rel, expected) {
    const relMany = this.hasMany[rel];
    if (relMany) {
      return Object.assign({
        resource: this.registry.getRes(relMany.type, expected),
      }, relMany);
    }
  }

  getPath(id, rel) {
    var path = this.basePath;
    if (id) path = `${path}/${id}`;
    if (rel) path = `${path}/relationships/${rel}`;
    return path;
  }
}

class JSONAPIRegistry {
  constructor(resources, server) {
    this.resources = {};
    Object.keys(resources).forEach(function (key) {
      this.add(key, resources[key]);
    }, this);
  }

  add(name, info) {
    this.resources[name] = new JSONAPIResource(name, info, this);
  }

  forEach(cb, self) {
    return Object.keys(this.resources).forEach(function (key) {
      return cb.call(self || this, this.resources[key]);
    }, this);
  }

  getRes(type) {
    const resource = this.resources[type];
    if (!resource)
      throw Boom.conflict(`Unknown resource type: ${type}`);
    return resource;
  }
}

class JSONAPISerializer {
  constructor(resource, registry) {
    this.resource = resource;
    this.registry = registry;
    this.metaCols = resource.specialCols.meta || [];
    this.hideCols = resource.specialCols.hidden || [];
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
    if (relInfo.included && included && relModel) {
      const relSerialized = relInfo.resource.serializer.serialize(relModel);
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
    if (!collection && relInfo.included && included)
      collection = model.related(rel);
    if (collection) {
      ret.data = collection.map(function (relModel) {
        if (relInfo.included && included) {
          const relSerialized = relInfo.resource.serializer.serialize(relModel);
          included.push(relSerialized);
        }
        return {
          type: relInfo.resource.type,
          id: `${relModel.id}`,
        };
      });
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
    return {
      type: this.resource.type,
      id: `${model.id}`,
      attributes: attrs,
      relationships: rels,
      meta: meta,
    };
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

module.exports.JSONAPIResource = JSONAPIResource;
module.exports.JSONAPIRegistry = JSONAPIRegistry;
module.exports.JSONAPISerializer = JSONAPISerializer;
