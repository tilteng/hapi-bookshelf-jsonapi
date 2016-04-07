'use strict';
const Boom = require('boom');

class JSONAPIResource {
  constructor(type, info, registry) {
    this.type = type;
    this.model = info.model;
    this.hasOne = info.relationships.hasOne || {};
    this.hasMany = info.relationships.hasMany || {};
    this.basePath = info.basePath || `/${type.toLowerCase()}s`;
    this.updatedCol = info.updatedColumn;
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
      this.resources[key] = new JSONAPIResource(key, resources[key], this);
    }, this);
  }

  forEach(cb) {
    return Object.keys(this.resources).forEach(function (key) {
      return cb(this.resources[key]);
    }, this);
  }

  getRes(type) {
    const resource = this.resources[type];
    if (!resource)
      throw new Boom.conflict(`Unknown resource type: ${type}`);
    return resource;
  }
}

class JSONAPISerializer {
  constructor(resource, registry) {
    this.resource = resource;
    this.registry = registry;
  }

  serializeRelOne(model, rel) {
    const relInfo = this.resource.getRelOne(rel);
    const relId = model.get(relInfo.column);
    const links = {self: this.resource.getPath(model.id, rel)};
    var data = null;
    if (relId) {
      links.related = relInfo.resource.getPath(relId);
      data = {
        type: relInfo.resource.type,
        id: relId,
      };
    }
    return {data: data, links: links};
  }

  serializeRelMany(model, rel, collection, paginate) {
    const relInfo = this.resource.getRelMany(rel);
    const ret = {
      links: {
        self: this.resource.getPath(model.id, rel),
        related: this.resource.getPath(model.id)+`/${rel}`,
      },
    };
    if (collection) {
      ret.data = collection.map(function (relModel) {
        return {
          type: relInfo.resource.type,
          id: relModel.id,
        };
      });
      if (paginate)
        Object.assign(ret.links, paginate.getLinks(collection));
    }
    return ret;
  }

  serialize(model) {
    const attrs = model.serialize({shallow: true});
    const rels = {};
    attrs.id = undefined;
    this.resource.forEachRelOne(function (rel, relInfo) {
      attrs[relInfo.column] = undefined;
      rels[rel] = this.serializeRelOne(model, rel);
    }, this);
    this.resource.forEachRelMany(function (rel) {
      rels[rel] = this.serializeRelMany(model, rel);
    }, this);
    return {
      type: this.resource.type,
      id: model.id,
      attributes: attrs,
      relationships: rels,
    };
  }

  deserialize(data) {
    if (data.type !== this.resource.type)
      throw new Boom.conflict(`Expected resource type ${this.resource.type}, got ${data.type}`);
    const attrs = Object.assign({}, data.attributes || {});
    const rels = data.relationships || {};
    this.resource.forEachRelOne(function (rel, relInfo) {
      if (rels[rel]) {
        Object.assign(attrs, this.deserializeRelOne(rels[rel].data, rel));
      }
    }, this);
    return attrs;
  }

  deserializeRelOne(data, rel) {
    const relOne = this.resource.getRelOne(rel);
    if (!data)
      return {[relOne.column]: null};
    if (data.type !== relOne.resource.type)
      throw new Boom.conflict(`Expected resource type ${relOne.resource.type}, got ${data.type}`);
    return {[relOne.column]: data.id};
  }

  deserializeRelMany(data, rel) {
    const relMany = this.resource.getRelMany(rel);
    if (!data) return [];
    return data.map(function (item) {
      if (item.type !== relMany.resource.type)
        throw new Boom.conflict(`Expected resource type ${relMany.resource.type}, got ${data.type}`);
      return item.id;
    });
  }
}

module.exports.JSONAPIResource = JSONAPIResource;
module.exports.JSONAPIRegistry = JSONAPIRegistry;
module.exports.JSONAPISerializer = JSONAPISerializer;
