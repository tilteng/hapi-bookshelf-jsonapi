'use strict';
const Joi = require('joi');

const intOrStr = () => Joi.alternatives().try(Joi.number(), Joi.string());

class JSONAPISchema {
  constructor(registry) {
    this.registry = registry;
  }

  _getRes(type) {
    return this.registry.resources[type];
  }

  getHasOneSchema() {
    return Joi.object().keys({
      data: Joi.object().keys({
        type: Joi.string().required(),
        id: intOrStr().required(),
        meta: Joi.object().unknown(),
      }).required(),
    });
  }

  getHasManySchema() {
    return Joi.object().keys({
      data: Joi.array().items(Joi.object().keys({
        type: Joi.string().required(),
        id: intOrStr().required(),
        meta: Joi.object().unknown(),
      })).required(),
    });
  }

  _getSchema(type, isCreate) {
    var attrSchema = Joi.object();
    var relSchema = Joi.object();
    const res = this._getRes(type);
    const relSchemaKeys = {};
    if (res.schema) {
      attrSchema = attrSchema.keys(res.schema);
      if (!isCreate) {
        attrSchema = attrSchema.optionalKeys(Object.keys(res.schema));
      } else {
        attrSchema = attrSchema.required();
      }
    } else {
      attrSchema = attrSchema.unknown().pattern(/.*/, Joi.string());
    }
    res.forEachRelOne(function (key, rel) {
      relSchemaKeys[key] = this.getHasOneSchema(rel.type);
      if (isCreate && rel.required) {
        relSchema = relSchema.required();
        relSchemaKeys[key] = relSchemaKeys[key].required();
      }
    }, this);
    res.forEachRelMany(function (key, rel) {
      relSchemaKeys[key] = this.getHasManySchema(rel.type);
      if (isCreate && rel.required) {
        relSchema = relSchema.required();
        relSchemaKeys[key] = relSchemaKeys[key].required();
      }
    }, this);
    return Joi.object().keys({
      data: Joi.object().keys({
        type: Joi.string().required(),
        id: intOrStr(),
        attributes: attrSchema,
        relationships: relSchema.keys(relSchemaKeys),
        meta: Joi.object().unknown(),
      }).required(),
      meta: Joi.object().unknown(),
    });
  }

  getCreateSchema(type) {
    return this._getSchema(type, true);
  }

  getUpdateSchema(type) {
    return this._getSchema(type, false);
  }
}

module.exports.JSONAPISchema = JSONAPISchema;
