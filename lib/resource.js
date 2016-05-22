'use strict';
const Serializer = require('./serializer');

class Resource {
  constructor(type, info, registry) {
    this.type = type;
    this.model = info.model;
    this.hasOne = info.relationships.hasOne || {};
    this.hasMany = info.relationships.hasMany || {};
    this.basePath = info.basePath || `/${type.toLowerCase()}s`;
    this.readonly = info.readonly;
    this.schema = info.schema;
    this.query = info.query || function (qb) { };
    this.specialCols = Object.assign(
      {meta: [], hidden: [], optional: {}},
      info.specialColumns
    );
    this.registry = registry;
  }

  getSerializer(query, stack) {
    return new Serializer(this, query, stack);
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

module.exports = Resource;
