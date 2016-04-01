'use strict';

function serialize(model) {
  const attrs = model.serialize({shallow: true});
  const rels = {};
  const type = model.jsonapi.type;
  const idAttr = model.jsonapi.idAttribute || model.idAttribute;
  const modelRels = model.jsonapi.relationships || {};
  attrs.id = undefined;
  Object.keys(modelRels).forEach(function (rel) {
    rels[rel] = {
      type: modelRels[rel].type,
      id: attrs[modelRels[rel].column],
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
  if (data.type !== model.jsonapi.type) return;
  const attrs = Object.assign({}, data.attributes || {});
  const rels = Object.assign({}, data.relationships || {});
  const modelRels = model.jsonapi.relationships || {};
  Object.keys(modelRels).forEach(function (rel) {
    if (rels[rel] && rels[rel].type === modelRels[rel].type) {
      attrs[modelRels[rel].column] = rels[rel].id;
    }
  });
  return attrs;
}

module.exports.serialize = serialize;
module.exports.deserialize = deserialize;
