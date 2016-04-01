'use strict';

const querystring = require('querystring');

class Paginate {
  constructor(model, basePath) {
    this.model = model;
    this.basePath = basePath;
    this.defaultLimit = module.exports.defaultLimit;
  }

  query(queryData, next) {
    const offset = queryData['page[offset]'];
    const limit = queryData['page[limit]'] || this.defaultLimit;
    return this.model.query(function (qb) {
      qb = qb.offset(offset).limit(limit);
      if (next) qb = next(qb);
      return qb;
    });
  }

  getLinks(queryData, collection) {
    const offset = parseInt(queryData['page[offset]'], 10) || 0;
    const limit = parseInt(queryData['page[limit]'], 10) || this.defaultLimit;
    var nextOffset = collection.length >= limit ? offset+limit : -1;
    var prevOffset = offset-limit;
    if (offset === 0) prevOffset = -1;
    else if (prevOffset < 0) prevOffset = 0;
    return {
      self: this._getQueryString(queryData),
      next: this._getQueryString(queryData, nextOffset),
      prev: this._getQueryString(queryData, prevOffset),
    };
  }

  _getQueryString(queryData, offset) {
    var query = Object.assign({}, queryData);
    if (offset < 0) return undefined;
    else if (offset === 0) delete query['page[offset]'];
    else if (offset) query['page[offset]'] = offset;
    var ret = querystring.stringify(query);
    if (ret) return this.basePath + '?' + ret;
    else return this.basePath;
  }
}

module.exports.defaultLimit = 25;
module.exports.Paginate = Paginate;
