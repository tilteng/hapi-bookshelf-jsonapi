'use strict';

const querystring = require('querystring');

class Paginate {
  constructor(request) {
    this.path = request.path;
    this.queryData = request.query || {};
    this.defaultLimit = module.exports.defaultLimit;

    var self = this;
    this.query = function paginateQuery(qb) {
      const offset = self.queryData['page[offset]'];
      const limit = self.queryData['page[limit]'] || self.defaultLimit;
      return qb.offset(offset).limit(limit);
    };
  }

  getLinks(collection) {
    const offset = parseInt(this.queryData['page[offset]'], 10) || 0;
    const limit = parseInt(this.queryData['page[limit]'], 10) || this.defaultLimit;
    var nextOffset = collection.length >= limit ? offset+limit : -1;
    var prevOffset = offset-limit;
    if (offset === 0) prevOffset = -1;
    else if (prevOffset < 0) prevOffset = 0;
    return {
      self: this._getQueryString(),
      next: this._getQueryString(nextOffset),
      prev: this._getQueryString(prevOffset),
      first: null,
      last: null,
    };
  }

  _getQueryString(offset) {
    var query = Object.assign({}, this.queryData);
    if (offset < 0) return undefined;
    else if (offset === 0) delete query['page[offset]'];
    else if (offset) query['page[offset]'] = offset;
    var ret = querystring.stringify(query);
    if (ret) return this.path + '?' + ret;
    else return this.path;
  }
}

module.exports.defaultLimit = 25;
module.exports.Paginate = Paginate;
