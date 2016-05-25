'use strict';
const Boom = require('boom');
const Schema = require('./schema');
const Resource = require('./resource');

class Registry {
  constructor(resources) {
    this.resources = {};
    Object.keys(resources).forEach(function (key) {
      this.add(key, resources[key]);
    }, this);
    this.schema = new Schema(this);
  }

  add(name, info) {
    this.resources[name] = new Resource(name, info, this);
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

module.exports = Registry;
