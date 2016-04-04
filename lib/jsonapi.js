'use strict';
const InvalidTypeError = require('./errors').InvalidTypeError;

class JSONAPISerializer {
  constructor(server) {
    this.server = server;
  }

  _getModel(from) {
    if (typeof from === 'string') {
      return this.server.plugins.bookshelf.model(from);
    } else {
      return from.constructor;
    }
  }

  _getModelType(modelCls) {
    return modelCls.jsonapi.type || modelCls.name;
  }

  _checkModelType(modelCls, data) {
    const modelType = this._getModelType(modelCls);
    if (data.type !== modelType) {
      throw new InvalidTypeError(data.type, modelType);
    }
  }

  serializeRel(model, rel) {
    const modelCls = this._getModel(model);
    const hasOne = modelCls.jsonapi.hasOne || {};
    const relId = model.get(hasOne[rel].column);
    var data = null;
    if (relId) {
      const relModelCls = this._getModel(hasOne[rel].model);
      data = {
        type: this._getModelType(relModelCls),
        id: relId,
      };
    }
    return {data: data};
  }

  serialize(model) {
    const modelCls = this._getModel(model);
    const hasOne = modelCls.jsonapi.hasOne || {};
    const attrs = model.serialize({shallow: true});
    const rels = {};
    attrs.id = undefined;
    Object.keys(hasOne).forEach(function (rel) {
      attrs[hasOne[rel].column] = undefined;
      rels[rel] = this.serializeRel(model, rel);
    }, this);
    return {
      type: this._getModelType(modelCls),
      id: model.id,
      attributes: attrs,
      relationships: rels,
    };
  }

  deserialize(modelCls, data) {
    const hasOne = modelCls.jsonapi.hasOne || {};
    this._checkModelType(modelCls, data);
    const attrs = Object.assign({}, data.attributes || {});
    const rels = data.relationships || {};
    Object.keys(hasOne).forEach(function (rel) {
      if (rels[rel]) {
        const relAttrs = this.deserializeRel(modelCls, rel, rels[rel].data)
        Object.assign(attrs, relAttrs);
      }
    }, this);
    return attrs;
  }

  deserializeRel(modelCls, rel, data) {
    const hasOne = modelCls.jsonapi.hasOne || {};
    const relModelCls = this._getModel(hasOne[rel].model);
    const relModelCol = hasOne[rel].column;
    if (!data)
      return {[relModelCol]: null};
    this._checkModelType(relModelCls, data);
    return {[relModelCol]: data.id};
  }
}

function register(server) {
  const serializer = new JSONAPISerializer(server);
  server.method('jsonapi.serialize', serializer.serialize, {bind: serializer});
  server.method('jsonapi.deserialize', serializer.deserialize, {bind: serializer});
  server.method('jsonapi.deserializeRel', serializer.deserializeRel, {bind: serializer});
}

module.exports.JSONAPISerializer = JSONAPISerializer;
module.exports.register = register;
