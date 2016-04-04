'use strict';
const InvalidTypeError = require('./errors').InvalidTypeError;

function serialize(model) {
  const attrs = model.serialize({shallow: true});
  const rels = {};
  const type = model.jsonapi.type;
  const idAttr = model.jsonapi.idAttribute || model.idAttribute;
  const modelRels = model.jsonapi.relationships || {};
  attrs.id = undefined;
  Object.keys(modelRels).forEach(function (rel) {
    rels[rel] = {
      data: {
        type: modelRels[rel].type,
        id: attrs[modelRels[rel].column],
      },
    };
    attrs[modelRels[rel].column] = undefined;
  });
  return {
    type: model.jsonapi.type,
    id: model[idAttr],
    attributes: attrs,
    relationships: rels,
  };
}

function deserialize(model, data) {
  return Promise.resolve(model.jsonapi).then(function (modelInfo) {
    if (data.type !== modelInfo.type)
      throw new InvalidTypeError(data.type, modelInfo.type);
    const attrs = Object.assign({}, data.attributes || {});
    const rels = Object.assign({}, data.relationships || {});
    const modelRels = modelInfo.relationships || {};
    Object.keys(rels).forEach(function (rel) {
      if (modelRels[rel] && rels[rel].type === modelRels[rel].type) {
        attrs[modelRels[rel].column] = rels[rel].id;
      }
    });
    return attrs;
  });
}

function deserializeRel(model, rel, data) {
  return Promise.resolve(model.jsonapi.relationships[rel]).then(function (relInfo) {
    if (!data)
      return {[relInfo.column]: null};
    else if (data.type !== relInfo.type)
      throw new InvalidTypeError(data.type, relInfo.type);
    return {[relInfo.column]: data.id};
  });
}

module.exports.serialize = serialize;
module.exports.deserialize = deserialize;
module.exports.deserializeRel = deserializeRel;
