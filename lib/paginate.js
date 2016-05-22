'use strict';
const querystring = require('querystring');

class Paginate {
  constructor(request) {
    const defaultLimit = Paginate.defaultPageLimit;
    const maxLimit = Paginate.maxPageLimit;
    this.path = request.path;
    this.limitRaw = request.query['page[limit]'];
    this.limit = parseInt(this.limitRaw, 10) || defaultLimit;
    this.offsetRaw = request.query['page[offset]'];
    this.offset = parseInt(this.offsetRaw, 10) || 0;
    this.query = this.query.bind(this);
    if (!maxLimit && this.limitRaw === 'none') this.limit = undefined;
    else if (maxLimit && this.limit > maxLimit) this.limit = maxLimit;
  }

  query(qb) {
    if (this.offset) qb.offset(this.offset);
    if (this.limit) qb.limit(this.limit);
    return qb;
  }

  getLinks(collection) {
    var nextOffset = collection.length >= this.limit ? this.offset + this.limit : -1;
    var prevOffset = this.offset - this.limit;
    if (this.offset === 0) prevOffset = -1;
    else if (prevOffset < 0) prevOffset = 0;
    return Object.assign({},
      this._getQueryString('self'),
      this._getQueryString('next', nextOffset),
      this._getQueryString('prev', prevOffset),
      this._getQueryString('first', 0)
    );
  }

  _getQueryString(key, offset) {
    if (offset < 0) return;
    if (offset === 0) return {[key]: this.path};
    if (!offset) offset = this.offsetRaw;
    const query = this.limitRaw
      ? {'page[offset]': offset, 'page[limit]': this.limitRaw}
      : {'page[offset]': offset};
    return {[key]: this.path + '?' + querystring.stringify(query)};
  }
}

Paginate.defaultPageLimit = 25;
Paginate.maxPageLimit = 200;

module.exports = Paginate;
